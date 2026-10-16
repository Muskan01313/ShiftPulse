export type Role = "Member" | "Manager" | "Admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  isActive: boolean;
}

export interface ShiftSettings {
  timeZone: string;
  start: string;
  end: string;
  rolloverHour: number;
}

export interface TeamOptions {
  workTypes: string[];
  complexities: string[];
  statuses: string[];
}

export interface Team {
  id: string;
  name: string;
  managerIds: string[];
  shift: ShiftSettings;
  options: TeamOptions;
  reportEmails: string[];
}

export interface Ticket {
  id: string;
  userId: string;
  shiftDate: string;
  ticketNumber: string;
  stubName: string;
  domain: string;
  analystName: string;
  workType: string;
  formComplexity: string;
  completedCount: number | null;
  comments: string;
  vstsNumber: string;
  status: string;
  timerSeconds: number;
  timerStartedAt: string | null;
  state: "Open" | "Submitted";
  submittedAt: string | null;
  closedBy: string | null;
  createdAt: string;
}

export type TicketFields = Pick<
  Ticket,
  "ticketNumber" | "stubName" | "domain" | "workType" | "formComplexity" | "completedCount" | "comments" | "vstsNumber" | "status"
>;

export interface Tenant {
  tenantId: string;
  programs: string[];
}

export interface AnalystSummary {
  userId: string;
  name: string;
  secondsByDay: Record<string, number>;
  totalSeconds: number;
  openSeconds: number;
  tickets: number;
  completed: number;
}

export interface TeamSummary {
  teamId: string;
  teamName: string;
  from: string;
  to: string;
  days: string[];
  analysts: AnalystSummary[];
}
