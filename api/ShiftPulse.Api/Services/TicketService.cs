using MongoDB.Driver;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;
using ShiftPulse.Api.Shifts;

namespace ShiftPulse.Api.Services;

/// <summary>The fields an analyst fills in on a ticket.</summary>
public record TicketFields(
    string? TicketNumber, string? StubName, string? Domain, string? WorkType, string? FormComplexity,
    int? CompletedCount, string? Comments, string? VstsNumber, string? Status);

public class TicketService(Db db, TimeProvider clock)
{
    public DateTime Now => clock.GetUtcNow().UtcDateTime;

    public async Task<ShiftSettings> ShiftFor(string? teamId)
    {
        if (teamId is null) return new ShiftSettings();
        var team = await db.Teams.Find(t => t.Id == teamId).FirstOrDefaultAsync();
        return team?.Shift ?? new ShiftSettings();
    }

    public static string? Validate(TicketFields f)
    {
        static bool TooLong(string? s, int max) => s is not null && s.Length > max;
        if (TooLong(f.TicketNumber, 100) || TooLong(f.StubName, 200) || TooLong(f.Domain, 200) || TooLong(f.WorkType, 100)
            || TooLong(f.FormComplexity, 200) || TooLong(f.VstsNumber, 100) || TooLong(f.Status, 100))
            return "One of the fields is too long.";
        if (TooLong(f.Comments, 5000)) return "Comments can be at most 5000 characters.";
        if (f.CompletedCount is < 1 or > 100) return "Completed Count must be between 1 and 100.";
        return null;
    }

    public static void Apply(Ticket t, TicketFields f)
    {
        t.TicketNumber = (f.TicketNumber ?? "").Trim();
        t.StubName = (f.StubName ?? "").Trim();
        t.Domain = (f.Domain ?? "").Trim();
        t.WorkType = (f.WorkType ?? "").Trim();
        t.FormComplexity = (f.FormComplexity ?? "").Trim();
        t.CompletedCount = f.CompletedCount;
        t.Comments = f.Comments ?? "";
        t.VstsNumber = (f.VstsNumber ?? "").Trim();
        t.Status = (f.Status ?? "").Trim();
    }

    /// <summary>Stops a running timer, folding the running stretch into the total. Never counts past the shift's close.</summary>
    public static void StopTimer(Ticket t, DateTime nowUtc, ShiftSettings shift)
    {
        if (t.TimerStartedAt is null) return;
        var end = Min(nowUtc, ShiftClock.ShiftClosesAt(shift, t.ShiftDate));
        t.TimerSeconds = t.SecondsAt(end);
        t.TimerStartedAt = null;
    }

    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;

    public async Task Save(Ticket t)
    {
        t.UpdatedAt = Now;
        await db.Tickets.ReplaceOneAsync(x => x.Id == t.Id, t);
    }

    /// <summary>Starting one ticket's timer pauses any other the same person has running.</summary>
    public async Task StartTimer(Ticket t, ShiftSettings shift)
    {
        var now = Now;
        var running = await db.Tickets.Find(x => x.UserId == t.UserId && x.TimerStartedAt != null && x.Id != t.Id).ToListAsync();
        foreach (var other in running)
        {
            StopTimer(other, now, shift);
            await Save(other);
        }
        t.TimerStartedAt ??= now;
        await Save(t);
    }

    public async Task<List<Ticket>> Submit(IEnumerable<Ticket> tickets, ShiftSettings shift, string closedBy)
    {
        var now = Now;
        var done = new List<Ticket>();
        foreach (var t in tickets.Where(t => t.State == TicketStates.Open))
        {
            StopTimer(t, now, shift);
            t.State = TicketStates.Submitted;
            t.SubmittedAt = now;
            t.ClosedBy = closedBy;
            await Save(t);
            done.Add(t);
        }
        return done;
    }

    /// <summary>Submits and locks every open ticket whose shift is over. Returns how many were closed.</summary>
    public async Task<int> CloseFinishedShifts(string? onlyUserId = null)
    {
        var filter = Builders<Ticket>.Filter.Eq(t => t.State, TicketStates.Open);
        if (onlyUserId is not null) filter &= Builders<Ticket>.Filter.Eq(t => t.UserId, onlyUserId);
        var open = await db.Tickets.Find(filter).ToListAsync();
        var shifts = new Dictionary<string, ShiftSettings>();
        var closed = 0;
        foreach (var group in open.GroupBy(t => t.TeamId ?? ""))
        {
            if (!shifts.TryGetValue(group.Key, out var shift))
                shifts[group.Key] = shift = await ShiftFor(group.Key == "" ? null : group.Key);
            var today = ShiftClock.ShiftDate(shift, Now);
            var stale = group.Where(t => string.CompareOrdinal(t.ShiftDate, today) < 0).ToList();
            closed += (await Submit(stale, shift, "ShiftEnded")).Count;
        }
        return closed;
    }
}
