import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Helper function to check user role in a chat
async function getUserRole(connection, chatId, userId) {
  const sql = `SELECT ROLE FROM CHAT_MEMBER WHERE CHAT_ID = :chatId AND USER_ID = :userId`;
  const result = await connection.execute(sql, { chatId, userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return result.rows.length > 0 ? result.rows[0].ROLE : null;
}

// ---------------------------------------------------------
// NOTICES
// ---------------------------------------------------------

export async function handleGetNotices(req, res, chatId) {
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT n.NOTICE_ID, n.CHAT_ID, n.TITLE, n.CONTENT, n.CREATED_AT, u.FULL_NAME AS CREATED_BY_NAME,
             na.ATTACHMENT_ID, na.FILE_NAME, na.FILE_PATH, na.FILE_TYPE, na.FILE_SIZE
      FROM NOTICE n
      JOIN USERS u ON n.CREATED_BY = u.USER_ID
      LEFT JOIN NOTICE_ATTACHMENT na ON n.NOTICE_ID = na.NOTICE_ID
      WHERE n.CHAT_ID = :chatId
      ORDER BY n.CREATED_AT DESC
    `;
    const result = await connection.execute(sql, { chatId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const noticesMap = new Map();
    for (const row of result.rows) {
      if (!noticesMap.has(row.NOTICE_ID)) {
        noticesMap.set(row.NOTICE_ID, {
          noticeId: row.NOTICE_ID,
          title: row.TITLE,
          content: row.CONTENT,
          createdAt: row.CREATED_AT,
          createdBy: row.CREATED_BY_NAME,
          attachments: []
        });
      }
      if (row.ATTACHMENT_ID) {
        noticesMap.get(row.NOTICE_ID).attachments.push({
          attachmentId: row.ATTACHMENT_ID,
          fileName: row.FILE_NAME,
          filePath: row.FILE_PATH,
          fileUrl: row.FILE_PATH, // Added fileUrl alias so frontends can open/download attachments
          fileType: row.FILE_TYPE,
          fileSize: row.FILE_SIZE
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ notices: Array.from(noticesMap.values()) }));
  } catch (err) {
    console.error('Fetch Notices Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch notices' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}

export async function handleCreateNotice(req, res, chatId) {
  const userId = req.user?.userId || req.userId;
  const { title, content, attachments } = req.body || {};

  if (!title || !content) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Title and content are required' }));
  }

  let connection;
  try {
    connection = await getConnection();
    const role = await getUserRole(connection, chatId, userId);
    if (role !== 'ADMIN' && role !== 'OWNER') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Only admins or owners can create notices' }));
    }

    const insertNoticeSql = `
      INSERT INTO NOTICE (CHAT_ID, CREATED_BY, TITLE, CONTENT)
      VALUES (:chatId, :userId, :title, :content)
      RETURNING NOTICE_ID INTO :noticeId
    `;
    const noticeResult = await connection.execute(insertNoticeSql, {
      chatId,
      userId,
      title,
      content,
      noticeId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });

    const noticeId = noticeResult.outBinds.noticeId[0];

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const insertAttSql = `
        INSERT INTO NOTICE_ATTACHMENT (NOTICE_ID, FILE_NAME, FILE_PATH, FILE_TYPE, FILE_SIZE)
        VALUES (:noticeId, :fileName, :filePath, :fileType, :fileSize)
      `;
      for (const att of attachments) {
        const filePath = att.filePath || att.fileUrl || att.url || att.path || '';
        await connection.execute(insertAttSql, {
          noticeId,
          fileName: att.fileName || att.name || 'Notice Attachment',
          filePath,
          fileType: att.fileType || att.type || 'application/octet-stream',
          fileSize: att.fileSize || att.size || 0
        });
      }
    }

    await connection.commit();
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ message: 'Notice created successfully', noticeId }));
  } catch (err) {
    console.error('Create Notice Error:', err);
    if (connection) try { await connection.rollback(); } catch (e) {}
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to create notice' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}

// ---------------------------------------------------------
// ASSIGNMENTS & SUBMISSIONS
// ---------------------------------------------------------

export async function handleGetAssignments(req, res, chatId) {
  const userId = req.user?.userId || req.userId;
  let connection;
  try {
    connection = await getConnection();
    const sql = `
      SELECT a.ASSIGNMENT_ID, a.TITLE, a.DESCRIPTION, a.DUE_DATE, a.IS_LOCKED, a.CREATED_AT,
             s.SUBMISSION_ID, s.FILE_URL, s.FILE_NAME, s.SUBMITTED_AT, s.NOTE
      FROM ASSIGNMENT a
      LEFT JOIN ASSIGNMENT_SUBMISSION s ON a.ASSIGNMENT_ID = s.ASSIGNMENT_ID AND s.USER_ID = :userId
      WHERE a.CHAT_ID = :chatId
      ORDER BY a.CREATED_AT DESC
    `;
    const result = await connection.execute(sql, { chatId, userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const assignments = result.rows.map(row => ({
      assignmentId: row.ASSIGNMENT_ID,
      title: row.TITLE,
      description: row.DESCRIPTION,
      dueDate: row.DUE_DATE,
      isLocked: row.IS_LOCKED === 'Y',
      createdAt: row.CREATED_AT,
      userSubmission: row.SUBMISSION_ID ? {
        submissionId: row.SUBMISSION_ID,
        fileUrl: row.FILE_URL,
        filePath: row.FILE_URL,
        fileName: row.FILE_NAME,
        submittedAt: row.SUBMITTED_AT,
        note: row.NOTE
      } : null
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ assignments }));
  } catch (err) {
    console.error('Fetch Assignments Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch assignments' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}

export async function handleCreateAssignment(req, res, chatId) {
  const userId = req.user?.userId || req.userId;
  const { title, description, dueDate } = req.body || {};

  if (!title) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Title is required' }));
  }

  let connection;
  try {
    connection = await getConnection();
    const role = await getUserRole(connection, chatId, userId);
    if (role !== 'ADMIN' && role !== 'OWNER') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Only admins or owners can create assignments' }));
    }

    const sql = `
      INSERT INTO ASSIGNMENT (CHAT_ID, CREATED_BY, TITLE, DESCRIPTION, DUE_DATE)
      VALUES (:chatId, :userId, :title, :description, TO_TIMESTAMP(:dueDate, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'))
      RETURNING ASSIGNMENT_ID INTO :assignmentId
    `;

    const result = await connection.execute(sql, {
      chatId,
      userId,
      title,
      description: description || '',
      dueDate: dueDate || new Date().toISOString(),
      assignmentId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });

    await connection.commit();
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      message: 'Assignment created successfully',
      assignmentId: result.outBinds.assignmentId[0]
    }));
  } catch (err) {
    console.error('Create Assignment Error:', err);
    if (connection) try { await connection.rollback(); } catch (e) {}
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to create assignment' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}

export async function handleSubmitAssignment(req, res, assignmentId) {
  const userId = req.user?.userId || req.userId;
  const body = req.body || {};

  // Support multiple file key names sent by mobile/web frontends
  const fileUrl = body.fileUrl || body.filePath || body.url || body.file;
  const fileName = body.fileName || body.name || 'Submission';
  const fileType = body.fileType || body.type || 'application/octet-stream';
  const fileSize = body.fileSize || body.size || 0;
  const note = body.note || '';

  if (!fileUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'fileUrl or filePath is required' }));
  }

  let connection;
  try {
    connection = await getConnection();

    const checkLockSql = `SELECT IS_LOCKED FROM ASSIGNMENT WHERE ASSIGNMENT_ID = :assignmentId`;
    const lockRes = await connection.execute(checkLockSql, { assignmentId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (lockRes.rows.length === 0 || lockRes.rows[0].IS_LOCKED === 'Y') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Assignment is locked or not found' }));
    }

    // MERGE statement handles both initial submission and resubmission cleanly
    const sql = `
      MERGE INTO ASSIGNMENT_SUBMISSION target
      USING (SELECT :assignmentId AS ASSIGNMENT_ID, :userId AS USER_ID FROM DUAL) src
      ON (target.ASSIGNMENT_ID = src.ASSIGNMENT_ID AND target.USER_ID = src.USER_ID)
      WHEN MATCHED THEN
        UPDATE SET 
          FILE_URL = :fileUrl,
          FILE_NAME = :fileName,
          FILE_TYPE = :fileType,
          FILE_SIZE = :fileSize,
          NOTE = :note,
          SUBMITTED_AT = CURRENT_TIMESTAMP
      WHEN NOT MATCHED THEN
        INSERT (ASSIGNMENT_ID, USER_ID, FILE_URL, FILE_NAME, FILE_TYPE, FILE_SIZE, NOTE)
        VALUES (:assignmentId, :userId, :fileUrl, :fileName, :fileType, :fileSize, :note)
    `;

    await connection.execute(sql, {
      assignmentId,
      userId,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      note
    });

    await connection.commit();
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ message: 'Assignment submitted successfully' }));
  } catch (err) {
    console.error('Submit Assignment Error:', err);
    if (connection) try { await connection.rollback(); } catch (e) {}
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to submit assignment' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}

// Get all submissions for an assignment (Admin / Teacher View)
export async function handleGetAssignmentSubmissions(req, res, assignmentId) {
  const userId = req.user?.userId || req.userId;
  let connection;
  try {
    connection = await getConnection();

    // Verify requesting user is ADMIN or OWNER in the chat associated with this assignment
    const authSql = `
      SELECT cm.ROLE
      FROM ASSIGNMENT a
      JOIN CHAT_MEMBER cm ON a.CHAT_ID = cm.CHAT_ID
      WHERE a.ASSIGNMENT_ID = :assignmentId AND cm.USER_ID = :userId
    `;
    const authRes = await connection.execute(authSql, { assignmentId, userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (authRes.rows.length === 0 || (authRes.rows[0].ROLE !== 'ADMIN' && authRes.rows[0].ROLE !== 'OWNER')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Only admins or owners can view submissions' }));
    }

    const sql = `
      SELECT s.SUBMISSION_ID, s.ASSIGNMENT_ID, s.USER_ID AS STUDENT_ID, 
             u.FULL_NAME AS STUDENT_NAME, u.USERNAME AS STUDENT_USERNAME,
             s.FILE_URL, s.FILE_NAME, s.FILE_TYPE, s.FILE_SIZE, s.NOTE, s.SUBMITTED_AT
      FROM ASSIGNMENT_SUBMISSION s
      JOIN USERS u ON s.USER_ID = u.USER_ID
      WHERE s.ASSIGNMENT_ID = :assignmentId
      ORDER BY s.SUBMITTED_AT DESC
    `;

    const result = await connection.execute(sql, { assignmentId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const submissions = result.rows.map(row => ({
      submissionId: row.SUBMISSION_ID,
      assignmentId: row.ASSIGNMENT_ID,
      studentId: row.STUDENT_ID,
      studentName: row.STUDENT_NAME || row.STUDENT_USERNAME,
      fileUrl: row.FILE_URL,
      filePath: row.FILE_URL,
      fileName: row.FILE_NAME,
      fileType: row.FILE_TYPE,
      fileSize: row.FILE_SIZE,
      note: row.NOTE,
      submittedAt: row.SUBMITTED_AT
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ submissions }));
  } catch (err) {
    console.error('Fetch Submissions Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch assignment submissions' }));
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}