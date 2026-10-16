using MongoDB.Driver;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Services;
using ShiftPulse.Api.Shifts;

namespace ShiftPulse.Api.Endpoints;

/// <summary>Called on a schedule (GitHub Actions) with the shared X-Job-Key header.</summary>
public static class JobEndpoints
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/jobs").AddEndpointFilter(async (ctx, next) =>
        {
            var settings = ctx.HttpContext.RequestServices.GetRequiredService<AppSettings>();
            var key = ctx.HttpContext.Request.Headers["X-Job-Key"].ToString();
            if (string.IsNullOrEmpty(settings.JobKey) || !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.UTF8.GetBytes(key), System.Text.Encoding.UTF8.GetBytes(settings.JobKey)))
                return Http.Error(401, "Missing or wrong job key.");
            return await next(ctx);
        });

        g.MapPost("/close-shifts", async (TicketService svc) => Results.Ok(new { closed = await svc.CloseFinishedShifts() }));

        // The shift that just ended, per team. Run it shortly after the shift ends (00:30 IST).
        g.MapPost("/daily-report", async (Db db, TicketService svc, ReportService reports) =>
        {
            await svc.CloseFinishedShifts();
            var sent = new List<object>();
            foreach (var team in await db.Teams.Find(_ => true).ToListAsync())
            {
                var day = ShiftClock.ShiftDate(team.Shift, svc.Now);
                var summary = await reports.Summarize(team, day, day);
                var title = $"{team.Name}: time worked, shift of {DateOnly.ParseExact(day, "yyyy-MM-dd"):dddd d MMMM yyyy}";
                sent.Add(new { team = team.Name, day, emailed = await reports.Email(team, title, ReportService.ToHtml(summary, title)) });
            }
            return Results.Ok(sent);
        });

        // Monday to Sunday of the week the latest shift belongs to. Run it after Friday's shift.
        g.MapPost("/weekly-report", async (Db db, TicketService svc, ReportService reports) =>
        {
            var sent = new List<object>();
            foreach (var team in await db.Teams.Find(_ => true).ToListAsync())
            {
                var monday = ReportService.MondayOf(ShiftClock.ShiftDate(team.Shift, svc.Now));
                var sunday = DateOnly.ParseExact(monday, "yyyy-MM-dd").AddDays(6).ToString("yyyy-MM-dd");
                var summary = await reports.Summarize(team, monday, sunday);
                var title = $"{team.Name}: time worked, week of {DateOnly.ParseExact(monday, "yyyy-MM-dd"):d MMMM yyyy}";
                sent.Add(new { team = team.Name, monday, emailed = await reports.Email(team, title, ReportService.ToHtml(summary, title)) });
            }
            return Results.Ok(sent);
        });
    }
}
