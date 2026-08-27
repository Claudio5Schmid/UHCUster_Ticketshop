"use server";

import { getAttendanceReport, type AttendanceReport } from "@/lib/admin/dashboard";

export async function getAttendanceReportAction(gameIds: string[]): Promise<AttendanceReport> {
  return getAttendanceReport(gameIds);
}
