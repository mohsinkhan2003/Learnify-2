
import { db } from "./db";
import { assignments } from "@shared/schema";
import { isNull, or } from "drizzle-orm";

async function cleanupOldAssignments() {
  console.log('[Cleanup] Starting cleanup of old assignments...');
  
  try {
    // Delete assignments that don't have the new required fields
    const result = await db
      .delete(assignments)
      .where(
        or(
          isNull(assignments.teacherName),
          isNull(assignments.teacherSchool),
          isNull(assignments.subject)
        )
      )
      .returning();
    
    console.log(`[Cleanup] ✅ Deleted ${result.length} old assignments without new fields`);
    console.log('[Cleanup] Deleted assignment IDs:', result.map(a => a.id));
    
    // Show remaining assignments
    const remaining = await db.select().from(assignments);
    console.log(`[Cleanup] ✅ ${remaining.length} assignments remaining with complete data`);
    
    process.exit(0);
  } catch (error) {
    console.error('[Cleanup] ❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupOldAssignments();
