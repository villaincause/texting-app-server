import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Helper for standard JSON responses
const sendResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Helper to safely extract field values regardless of array/object outFormat
const getRoleValue = (row) => {
  if (!row) return null;
  return row.ROLE || row.role || (Array.isArray(row) ? row[0] : null);
};

// 1. Create a Work or Study Group
export const createGroup = async (req, res, body, userId) => {
  const { title, description, groupType } = body; // groupType: 'WORK' or 'STUDY'

  if (!title || !groupType) {
    return sendResponse(res, 400, { error: 'Group title and groupType are required' });
  }

  let conn;
  try {
    conn = await getConnection();

    // Insert into CHAT
    const chatResult = await conn.execute(
      `INSERT INTO CHAT (CHAT_TYPE, TITLE) 
       VALUES ('GROUP', :title) 
       RETURNING CHAT_ID INTO :chatId`,
      {
        title,
        chatId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: false }
    );

    const chatId = chatResult.outBinds.chatId[0];

    // Insert into GROUP_METADATA
    await conn.execute(
      `INSERT INTO GROUP_METADATA (CHAT_ID, GROUP_TYPE, DESCRIPTION, CREATED_BY) 
       VALUES (:chatId, :groupType, :description, :userId)`,
      { chatId, groupType, description: description || null, userId },
      { autoCommit: false }
    );

    // Add creator as OWNER in CHAT_MEMBER
    await conn.execute(
      `INSERT INTO CHAT_MEMBER (CHAT_ID, USER_ID, ROLE) 
       VALUES (:chatId, :userId, 'OWNER')`,
      { chatId, userId },
      { autoCommit: false }
    );

    await conn.commit();
    return sendResponse(res, 201, { message: 'Group created successfully', chatId });
  } catch (err) {
    if (conn) await conn.rollback();
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// 2. Add Member to Group
export const addGroupMember = async (req, res, body, userId, chatId) => {
  const { targetUserId, role = 'MEMBER' } = body;

  let conn;
  try {
    conn = await getConnection();

    // Check if requester is ADMIN or OWNER
    const memberCheck = await conn.execute(
      `SELECT ROLE FROM CHAT_MEMBER WHERE CHAT_ID = :chatId AND USER_ID = :userId`,
      [chatId, userId]
    );

    const userRole = getRoleValue(memberCheck.rows[0]);

    if (!memberCheck.rows.length || !['OWNER', 'ADMIN'].includes(userRole)) {
      return sendResponse(res, 403, { error: 'Forbidden: Only group admins can add members' });
    }

    await conn.execute(
      `INSERT INTO CHAT_MEMBER (CHAT_ID, USER_ID, ROLE) VALUES (:chatId, :targetUserId, :role)`,
      { chatId, targetUserId, role },
      { autoCommit: true }
    );

    return sendResponse(res, 200, { message: 'Member added successfully' });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// 3. Create Assignment (Admin Only)
export const createAssignment = async (req, res, body, userId, chatId) => {
  const { title, description, dueDate } = body;

  if (!title) {
    return sendResponse(res, 400, { error: 'Assignment title is required' });
  }

  let conn;
  try {
    conn = await getConnection();

    // Verify user is ADMIN or OWNER
    const checkRole = await conn.execute(
      `SELECT ROLE FROM CHAT_MEMBER WHERE CHAT_ID = :chatId AND USER_ID = :userId`,
      [chatId, userId]
    );

    const userRole = getRoleValue(checkRole.rows[0]);

    if (!checkRole.rows.length || !['OWNER', 'ADMIN'].includes(userRole)) {
      return sendResponse(res, 403, { error: 'Forbidden: Only group admins can post assignments' });
    }

    const result = await conn.execute(
      `INSERT INTO ASSIGNMENT (CHAT_ID, CREATED_BY, TITLE, DESCRIPTION, DUE_DATE)
       VALUES (:chatId, :userId, :title, :description, TO_TIMESTAMP(:dueDate, 'YYYY-MM-DD HH24:MI:SS'))
       RETURNING ASSIGNMENT_ID INTO :assignmentId`,
      {
        chatId,
        userId,
        title,
        description: description || null,
        dueDate: dueDate || null,
        assignmentId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    const assignmentId = result.outBinds.assignmentId[0];
    return sendResponse(res, 201, { message: 'Assignment created successfully', assignmentId });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// 4. Submit Assignment (Supports Versioning)
export const submitAssignment = async (req, res, body, userId, assignmentId) => {
  const { fileUrl, fileName, fileType, fileSize, note } = body;

  if (!fileUrl) {
    return sendResponse(res, 400, { error: 'fileUrl from Cloudinary is required' });
  }

  let conn;
  try {
    conn = await getConnection();

    // Check if locked
    const lockCheck = await conn.execute(
      `SELECT IS_LOCKED FROM ASSIGNMENT WHERE ASSIGNMENT_ID = :assignmentId`,
      [assignmentId]
    );

    if (!lockCheck.rows.length) {
      return sendResponse(res, 404, { error: 'Assignment not found' });
    }

    const row = lockCheck.rows[0];
    const isLocked = row.IS_LOCKED || row.is_locked || (Array.isArray(row) ? row[0] : null);

    if (isLocked === 'Y') {
      return sendResponse(res, 403, { error: 'Submissions are locked by the administrator' });
    }

    // Insert submission with auto-incremented version number
    await conn.execute(
      `INSERT INTO ASSIGNMENT_SUBMISSION (
        ASSIGNMENT_ID, USER_ID, FILE_URL, FILE_NAME, FILE_TYPE, FILE_SIZE, NOTE, VERSION_NUMBER
       ) VALUES (
        :assignmentId, :userId, :fileUrl, :fileName, :fileType, :fileSize, :note,
        (SELECT NVL(MAX(VERSION_NUMBER), 0) + 1 FROM ASSIGNMENT_SUBMISSION WHERE ASSIGNMENT_ID = :assignmentId AND USER_ID = :userId)
       )`,
      {
        assignmentId,
        userId,
        fileUrl,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize || null,
        note: note || null
      },
      { autoCommit: true }
    );

    return sendResponse(res, 201, { message: 'Assignment submitted successfully' });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// 5. Lock / Unlock Assignment (Admin Only)
export const toggleAssignmentLock = async (req, res, body, userId, assignmentId) => {
  const { isLocked } = body; // 'Y' or 'N'

  let conn;
  try {
    conn = await getConnection();

    // Check if user is owner/admin of the group containing this assignment
    const adminCheck = await conn.execute(
      `SELECT cm.ROLE 
       FROM CHAT_MEMBER cm
       JOIN ASSIGNMENT a ON cm.CHAT_ID = a.CHAT_ID
       WHERE a.ASSIGNMENT_ID = :assignmentId AND cm.USER_ID = :userId`,
      [assignmentId, userId]
    );

    const userRole = getRoleValue(adminCheck.rows[0]);

    if (!adminCheck.rows.length || !['OWNER', 'ADMIN'].includes(userRole)) {
      return sendResponse(res, 403, { error: 'Forbidden: Only admins can lock/unlock assignments' });
    }

    await conn.execute(
      `UPDATE ASSIGNMENT SET IS_LOCKED = :isLocked, UPDATED_AT = CURRENT_TIMESTAMP WHERE ASSIGNMENT_ID = :assignmentId`,
      { isLocked, assignmentId },
      { autoCommit: true }
    );

    return sendResponse(res, 200, { message: `Assignment status updated to locked=${isLocked}` });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// 6. Get All Submissions for an Assignment (Latest version per user)
export const getAssignmentSubmissions = async (req, res, userId, assignmentId) => {
  let conn;
  try {
    conn = await getConnection();

    const result = await conn.execute(
      `SELECT s.SUBMISSION_ID, s.ASSIGNMENT_ID, s.USER_ID, s.FILE_URL, s.FILE_NAME, 
              s.SUBMITTED_AT, s.VERSION_NUMBER, s.NOTE, u.FULL_NAME, u.USERNAME
       FROM ASSIGNMENT_SUBMISSION s
       JOIN USERS u ON s.USER_ID = u.USER_ID
       WHERE s.ASSIGNMENT_ID = :assignmentId
         AND s.VERSION_NUMBER = (
           SELECT MAX(VERSION_NUMBER) 
           FROM ASSIGNMENT_SUBMISSION 
           WHERE ASSIGNMENT_ID = s.ASSIGNMENT_ID AND USER_ID = s.USER_ID
         )
       ORDER BY s.SUBMITTED_AT DESC`,
      [assignmentId]
    );

    return sendResponse(res, 200, { submissions: result.rows });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};