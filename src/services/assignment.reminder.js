import { getConnection } from '../config/database.js';
import { createAndSendNotification } from './notification.service.js';

export const startAssignmentReminderScheduler = (io, userSockets) => {
  // Run check every 5 minutes
  setInterval(async () => {
    let conn;
    try {
      conn = await getConnection();

      // Find active, un-locked assignments with upcoming due dates
      const activeAssignments = await conn.execute(
        `SELECT a.ASSIGNMENT_ID, a.TITLE, a.CHAT_ID, a.DUE_DATE,
                (a.DUE_DATE - CURRENT_TIMESTAMP) * 24 AS HOURS_LEFT
         FROM ASSIGNMENT a
         WHERE a.IS_LOCKED = 'N' 
           AND a.DUE_DATE > CURRENT_TIMESTAMP 
           AND a.DUE_DATE <= CURRENT_TIMESTAMP + INTERVAL '2' DAY`
      );

      for (const row of activeAssignments.rows || []) {
        const assignmentId = row.ASSIGNMENT_ID ?? row[0];
        const title = row.TITLE ?? row[1];
        const chatId = row.CHAT_ID ?? row[2];
        const hoursLeft = row.HOURS_LEFT ?? row[4];

        // Determine trigger window
        let intervalKey = null;
        let timeLabel = '';

        if (hoursLeft > 47 && hoursLeft <= 48.1) {
          intervalKey = '2d';
          timeLabel = '2 days';
        } else if (hoursLeft > 23 && hoursLeft <= 24.1) {
          intervalKey = '1d';
          timeLabel = '1 day';
        } else if (hoursLeft > 5.8 && hoursLeft <= 6.1) {
          intervalKey = '6h';
          timeLabel = '6 hours';
        } else if (hoursLeft > 0.8 && hoursLeft <= 1.1) {
          intervalKey = '1h';
          timeLabel = '1 hour';
        }

        if (!intervalKey) continue;

        // Get group members who have not yet submitted
        const pendingMembers = await conn.execute(
          `SELECT cm.USER_ID 
           FROM CHAT_MEMBER cm
           WHERE cm.CHAT_ID = :chatId
             AND cm.USER_ID NOT IN (
               SELECT USER_ID FROM ASSIGNMENT_SUBMISSION WHERE ASSIGNMENT_ID = :assignmentId
             )`,
          { chatId, assignmentId }
        );

        for (const member of pendingMembers.rows || []) {
          const userId = member.USER_ID ?? member[0];

          // Check if reminder was already dispatched for this interval
          const alreadySent = await conn.execute(
            `SELECT 1 FROM ASSIGNMENT_REMINDERS_LOG 
             WHERE ASSIGNMENT_ID = :assignmentId AND USER_ID = :userId AND INTERVAL_KEY = :intervalKey`,
            { assignmentId, userId, intervalKey }
          );

          if (!alreadySent.rows || alreadySent.rows.length === 0) {
            // Send Notification
            await createAndSendNotification(io, userSockets, {
              userId,
              type: 'ASSIGNMENT_REMINDER',
              title: `Assignment Due Warning`,
              body: `"${title}" is due in ${timeLabel}! Tap to open submission.`,
              chatId,
              assignmentId
            });

            // Log dispatched reminder
            await conn.execute(
              `INSERT INTO ASSIGNMENT_REMINDERS_LOG (ASSIGNMENT_ID, USER_ID, INTERVAL_KEY)
               VALUES (:assignmentId, :userId, :intervalKey)`,
              { assignmentId, userId, intervalKey },
              { autoCommit: true }
            );
          }
        }
      }
    } catch (err) {
      console.error('Error running reminder scheduler:', err);
    } finally {
      if (conn) await conn.close();
    }
  }, 5 * 60 * 1000);
};