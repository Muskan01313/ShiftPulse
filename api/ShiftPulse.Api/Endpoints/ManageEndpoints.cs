using MongoDB.Driver;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;
using ShiftPulse.Api.Services;
using ShiftPulse.Api.Shifts;

namespace ShiftPulse.Api.Endpoints;

/// <summary>Managers see and correct their own teams' work; admins see every team.</summary>
public static class ManageEndpoints
{
    public record NewMemberRequest(string Name, string Email, string Password);
    public record CorrectionRequest(TicketFields Fields, long? TimerSeconds);

    /// <summary>The team, if the signed-in person manages it (admins manage every team).</summary>
    public static async Task<(User? me, Team? team, IResult? error)> ManagedTeam(string teamId, CurrentUser current, Db db)
    {
        var me = await current.GetAsync();
        if (me is null) return (null, null, Http.Unauthorized());
        var team = await db.Teams.Find(t => t.Id == teamId).FirstOrDefaultAsync();
        if (team is null) return (me, null, Http.NotFound("Team not found"));
        if (me.Role != Roles.Admin && !(me.Role == Roles.Manager && team.ManagerIds.Contains(me.Id)))
            return (me, null, Http.Forbidden("You don't manage this team."));
        return (me, team, null);
    }

    static IResult? CheckRange(string? from, string? to)
    {
        if (!ShiftClock.IsValidDate(from) || !ShiftClock.IsValidDate(to)) return Http.BadRequest("Use dates like 2026-10-16 for from and to.");
        if (string.CompareOrdinal(from, to) > 0) return Http.BadRequest("The start date is after the end date.");
        return null;
    }

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/manage").RequireAuthorization("Manager");

        g.MapGet("/teams", async (CurrentUser current, Db db) =>
        {
            var me = await current.GetAsync();
            if (me is null) return Http.Unauthorized();
            var teams = me.Role == Roles.Admin
                ? await db.Teams.Find(_ => true).SortBy(t => t.Name).ToListAsync()
                : await db.Teams.Find(t => t.ManagerIds.Contains(me.Id)).SortBy(t => t.Name).ToListAsync();
            var ids = teams.Select(t => t.Id).ToList();
            var members = await db.Users.Find(u => u.TeamId != null && ids.Contains(u.TeamId)).SortBy(u => u.Name).ToListAsync();
            return Results.Ok(teams.Select(t => new
            {
                team = TeamDto.From(t),
                currentShiftDate = ShiftClock.ShiftDate(t.Shift, DateTime.UtcNow),
                members = members.Where(m => m.TeamId == t.Id).Select(UserDto.From),
            }));
        });

        g.MapGet("/teams/{teamId}/summary", async (string teamId, string? from, string? to, CurrentUser current, Db db, ReportService reports) =>
        {
            var (_, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            if (CheckRange(from, to) is { } bad) return bad;
            return Results.Ok(await reports.Summarize(team!, from!, to!));
        });

        g.MapGet("/teams/{teamId}/tickets", async (string teamId, string? from, string? to, string? userId, CurrentUser current, Db db) =>
        {
            var (_, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            if (CheckRange(from, to) is { } bad) return bad;
            var f = Builders<Ticket>.Filter;
            var filter = f.Eq(t => t.TeamId, team!.Id) & f.Gte(t => t.ShiftDate, from) & f.Lte(t => t.ShiftDate, to);
            if (!string.IsNullOrEmpty(userId)) filter &= f.Eq(t => t.UserId, userId);
            var rows = await db.Tickets.Find(filter).SortByDescending(t => t.ShiftDate).ThenBy(t => t.AnalystName).ThenBy(t => t.CreatedAt).Limit(5000).ToListAsync();
            return Results.Ok(new { serverNow = DateTime.UtcNow, tickets = rows.Select(TicketDto.From) });
        });

        g.MapGet("/teams/{teamId}/export.csv", async (string teamId, string? from, string? to, CurrentUser current, Db db) =>
        {
            var (_, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            if (CheckRange(from, to) is { } bad) return bad;
            var f = Builders<Ticket>.Filter;
            var rows = await db.Tickets.Find(f.Eq(t => t.TeamId, team!.Id) & f.Gte(t => t.ShiftDate, from) & f.Lte(t => t.ShiftDate, to))
                .SortBy(t => t.ShiftDate).ThenBy(t => t.AnalystName).ToListAsync();
            var ids = rows.Select(r => r.UserId).Distinct().ToList();
            var names = (await db.Users.Find(u => ids.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id, u => u.Name);
            var csv = ReportService.Csv(rows, names, DateTime.UtcNow);
            return Results.File(System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(csv)).ToArray(),
                "text/csv", $"shiftpulse-{team.Name}-{from}-to-{to}.csv");
        });

        g.MapPut("/teams/{teamId}/options", async (string teamId, TeamOptions options, CurrentUser current, Db db) =>
        {
            var (_, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            static List<string> Clean(List<string>? l) => (l ?? []).Select(x => x.Trim()).Where(x => x.Length is > 0 and <= 200).Distinct().Take(500).ToList();
            team!.Options = new TeamOptions { WorkTypes = Clean(options.WorkTypes), Complexities = Clean(options.Complexities), Statuses = Clean(options.Statuses) };
            await db.Teams.ReplaceOneAsync(t => t.Id == team.Id, team);
            return Results.Ok(team.Options);
        });

        // Managers add analysts to their own team.
        g.MapPost("/teams/{teamId}/members", async (string teamId, NewMemberRequest req, CurrentUser current, Db db) =>
        {
            var (_, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            var check = AdminEndpoints.CheckNewUser(req.Name, req.Email, req.Password);
            if (check is not null) return check;
            var user = new User { Name = req.Name.Trim(), Email = req.Email.Trim().ToLowerInvariant(), PasswordHash = Passwords.Hash(req.Password), Role = Roles.Member, TeamId = team!.Id };
            try { await db.Users.InsertOneAsync(user); }
            catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey) { return Http.Error(409, "Someone already uses that email."); }
            return Results.Ok(UserDto.From(user));
        });

        // Managers can switch a member of their team off (or back on).
        g.MapPost("/teams/{teamId}/members/{userId}/active", async (string teamId, string userId, bool active, CurrentUser current, Db db) =>
        {
            var (me, team, error) = await ManagedTeam(teamId, current, db);
            if (error is not null) return error;
            var member = await db.Users.Find(u => u.Id == userId && u.TeamId == team!.Id).FirstOrDefaultAsync();
            if (member is null) return Http.NotFound("That person isn't in this team.");
            if (member.Role != Roles.Member && me!.Role != Roles.Admin) return Http.Forbidden("Only an admin can change a manager's account.");
            await db.Users.UpdateOneAsync(u => u.Id == member.Id, Builders<User>.Update.Set(u => u.IsActive, active));
            return Results.Ok(new { ok = true });
        });

        // A manager's correction to any ticket in their team, kept in the audit log.
        g.MapPut("/tickets/{id}", async (string id, CorrectionRequest req, CurrentUser current, Db db, TicketService svc) =>
        {
            var t = await db.Tickets.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (t?.TeamId is null) return Http.NotFound();
            var (me, _, error) = await ManagedTeam(t.TeamId, current, db);
            if (error is not null) return error;
            if (TicketService.Validate(req.Fields) is { } err) return Http.BadRequest(err);
            if (req.TimerSeconds is < 0 or > 24 * 3600) return Http.BadRequest("Time must be between 0 and 24 hours.");
            var before = $"{t.TicketNumber}|{t.StubName}|{t.Domain}|{t.Status}|{t.CompletedCount}|{t.TimerSeconds}s";
            TicketService.Apply(t, req.Fields);
            if (req.TimerSeconds is { } s) { t.TimerSeconds = s; t.TimerStartedAt = null; }
            await svc.Save(t);
            await db.Audit.InsertOneAsync(new AuditEntry
            {
                ActorId = me!.Id, TicketId = t.Id,
                Change = $"{before} -> {t.TicketNumber}|{t.StubName}|{t.Domain}|{t.Status}|{t.CompletedCount}|{t.TimerSeconds}s",
            });
            return Results.Ok(TicketDto.From(t));
        });
    }
}
