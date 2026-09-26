import {
  createGroup,
  addGroupMember,
  createAssignment,
  submitAssignment,
  toggleAssignmentLock,
  getAssignmentSubmissions
} from '../controllers/group.controller.js';

export const handleGroupRoutes = async (req, res, userId) => {
  const { method, url, body } = req; // <--- Use req.body parsed by app.js

  // Route 1: POST /api/groups -> Create group
  if (method === 'POST' && url === '/api/groups') {
    await createGroup(req, res, body, userId);
    return true;
  }

  // Route 2: POST /api/groups/:chatId/members -> Add member
  const addMemberMatch = url.match(/^\/api\/groups\/(\d+)\/members$/);
  if (method === 'POST' && addMemberMatch) {
    const chatId = parseInt(addMemberMatch[1], 10);
    await addGroupMember(req, res, body, userId, chatId);
    return true;
  }

  // Route 3: POST /api/groups/:chatId/assignments -> Create assignment
  const createAsgnMatch = url.match(/^\/api\/groups\/(\d+)\/assignments$/);
  if (method === 'POST' && createAsgnMatch) {
    const chatId = parseInt(createAsgnMatch[1], 10);
    await createAssignment(req, res, body, userId, chatId);
    return true;
  }

  // Route 4: POST /api/assignments/:assignmentId/submit -> Submit assignment
  const submitMatch = url.match(/^\/api\/assignments\/(\d+)\/submit$/);
  if (method === 'POST' && submitMatch) {
    const assignmentId = parseInt(submitMatch[1], 10);
    await submitAssignment(req, res, body, userId, assignmentId);
    return true;
  }

  // Route 5: PATCH /api/assignments/:assignmentId/lock -> Lock assignment
  const lockMatch = url.match(/^\/api\/assignments\/(\d+)\/lock$/);
  if (method === 'PATCH' && lockMatch) {
    const assignmentId = parseInt(lockMatch[1], 10);
    await toggleAssignmentLock(req, res, body, userId, assignmentId);
    return true;
  }

  // Route 6: GET /api/assignments/:assignmentId/submissions -> Get all submissions
  const getSubmissionsMatch = url.match(/^\/api\/assignments\/(\d+)\/submissions$/);
  if (method === 'GET' && getSubmissionsMatch) {
    const assignmentId = parseInt(getSubmissionsMatch[1], 10);
    await getAssignmentSubmissions(req, res, userId, assignmentId);
    return true;
  }

  // If route didn't match
  return false;
};