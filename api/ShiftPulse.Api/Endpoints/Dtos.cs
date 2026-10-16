using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Endpoints;

public record UserDto(string Id, string Name, string Email, string Role, string? TeamId, bool IsActive)
{
    public static UserDto From(User u) => new(u.Id, u.Name, u.Email, u.Role, u.TeamId, u.IsActive);
}

public record TicketDto(
    string Id, string UserId, string ShiftDate, string TicketNumber, string StubName, string Domain, string AnalystName,
    string WorkType, string FormComplexity, int? CompletedCount, string Comments, string VstsNumber, string Status,
    long TimerSeconds, DateTime? TimerStartedAt, string State, DateTime? SubmittedAt, string? ClosedBy, DateTime CreatedAt)
{
    public static TicketDto From(Ticket t) => new(
        t.Id, t.UserId, t.ShiftDate, t.TicketNumber, t.StubName, t.Domain, t.AnalystName, t.WorkType, t.FormComplexity,
        t.CompletedCount, t.Comments, t.VstsNumber, t.Status, t.TimerSeconds, t.TimerStartedAt, t.State, t.SubmittedAt,
        t.ClosedBy, t.CreatedAt);
}

public record TeamDto(string Id, string Name, List<string> ManagerIds, ShiftSettings Shift, TeamOptions Options, List<string> ReportEmails)
{
    public static TeamDto From(Team t) => new(t.Id, t.Name, t.ManagerIds, t.Shift, t.Options, t.ReportEmails);
}
