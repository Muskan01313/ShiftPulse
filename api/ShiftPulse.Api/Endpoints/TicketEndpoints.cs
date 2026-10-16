using MongoDB.Driver;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;
using ShiftPulse.Api.Services;
using ShiftPulse.Api.Shifts;

namespace ShiftPulse.Api.Endpoints;

/// <summary>An analyst's own work for the current shift. Nothing here reads or changes anyone else's tickets.</summary>
public static class TicketEndpoints
{
    public record SubmitRequest(List<string>? Ids);

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/tickets").RequireAuthorization();

        g.MapGet("/shift", async (CurrentUser current, Db db, TicketService svc) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            await svc.CloseFinishedShifts(user.Id);
            var shift = await svc.ShiftFor(user.TeamId);
            var today = ShiftClock.ShiftDate(shift, svc.Now);
            var mine = await db.Tickets.Find(t => t.UserId == user.Id && t.ShiftDate == today).SortBy(t => t.CreatedAt).ToListAsync();
            return Results.Ok(new
            {
                shiftDate = today,
                shift,
                closesAt = ShiftClock.ShiftClosesAt(shift, today),
                serverNow = svc.Now,
                tickets = mine.Select(TicketDto.From),
            });
        });

        g.MapPost("/", async (TicketFields? fields, CurrentUser current, Db db, TicketService svc) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            fields ??= new TicketFields(null, null, null, null, null, null, null, null, null);
            if (TicketService.Validate(fields) is { } err) return Http.BadRequest(err);
            var shift = await svc.ShiftFor(user.TeamId);
            var t = new Ticket { UserId = user.Id, TeamId = user.TeamId, ShiftDate = ShiftClock.ShiftDate(shift, svc.Now), AnalystName = user.Name };
            TicketService.Apply(t, fields);
            await db.Tickets.InsertOneAsync(t);
            return Results.Ok(TicketDto.From(t));
        });

        // Loads one of your own tickets that you can still change: open and in the current shift.
        static async Task<(Ticket? t, ShiftSettings shift, IResult? error)> Editable(string id, CurrentUser current, Db db, TicketService svc)
        {
            var user = await current.GetAsync();
            if (user is null) return (null, new(), Http.Unauthorized());
            var t = await db.Tickets.Find(x => x.Id == id && x.UserId == user.Id).FirstOrDefaultAsync();
            if (t is null) return (null, new(), Http.NotFound());
            var shift = await svc.ShiftFor(t.TeamId);
            if (t.State != TicketStates.Open || t.ShiftDate != ShiftClock.ShiftDate(shift, svc.Now))
                return (null, shift, Http.Error(409, "This ticket is locked. Submitted work and work from a finished shift can't be changed."));
            return (t, shift, null);
        }

        g.MapPut("/{id}", async (string id, TicketFields fields, CurrentUser current, Db db, TicketService svc) =>
        {
            var (t, _, error) = await Editable(id, current, db, svc);
            if (error is not null) return error;
            if (TicketService.Validate(fields) is { } err) return Http.BadRequest(err);
            TicketService.Apply(t!, fields);
            await svc.Save(t!);
            return Results.Ok(TicketDto.From(t!));
        });

        g.MapPost("/{id}/time", async (string id, SetTimeRequest req, CurrentUser current, Db db, TicketService svc) =>
        {
            var (t, _, error) = await Editable(id, current, db, svc);
            if (error is not null) return error;
            if (t!.TimerStartedAt is not null) return Http.Error(409, "Pause the timer before correcting the time.");
            if (req.Seconds is < 0 or > 24 * 3600) return Http.BadRequest("Time must be between 0 and 24 hours.");
            t.TimerSeconds = req.Seconds;
            await svc.Save(t);
            return Results.Ok(TicketDto.From(t));
        });

        g.MapPost("/{id}/start", async (string id, CurrentUser current, Db db, TicketService svc) =>
        {
            var (t, shift, error) = await Editable(id, current, db, svc);
            if (error is not null) return error;
            await svc.StartTimer(t!, shift);
            return Results.Ok(TicketDto.From(t!));
        });

        g.MapPost("/{id}/pause", async (string id, CurrentUser current, Db db, TicketService svc) =>
        {
            var (t, shift, error) = await Editable(id, current, db, svc);
            if (error is not null) return error;
            TicketService.StopTimer(t!, svc.Now, shift);
            await svc.Save(t!);
            return Results.Ok(TicketDto.From(t!));
        });

        g.MapDelete("/{id}", async (string id, CurrentUser current, Db db, TicketService svc) =>
        {
            var (t, _, error) = await Editable(id, current, db, svc);
            if (error is not null) return error;
            await db.Tickets.DeleteOneAsync(x => x.Id == t!.Id);
            return Results.Ok(new { ok = true });
        });

        // Submits your open tickets for this shift that have a ticket number (or just the ones listed).
        g.MapPost("/submit", async (SubmitRequest? req, CurrentUser current, Db db, TicketService svc) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            var shift = await svc.ShiftFor(user.TeamId);
            var today = ShiftClock.ShiftDate(shift, svc.Now);
            var open = await db.Tickets.Find(t => t.UserId == user.Id && t.ShiftDate == today && t.State == TicketStates.Open).ToListAsync();
            var ready = open.Where(t => t.TicketNumber != "" && (req?.Ids is null || req.Ids.Contains(t.Id))).ToList();
            var done = await svc.Submit(ready, shift, "Analyst");
            return Results.Ok(new { submitted = done.Count, skipped = open.Count - done.Count });
        });
    }

    public record SetTimeRequest(long Seconds);
}
