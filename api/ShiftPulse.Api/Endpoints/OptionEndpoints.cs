using MongoDB.Driver;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Endpoints;

public static class OptionEndpoints
{
    public static void Map(WebApplication app)
    {
        // The dropdown choices for the signed-in person's team.
        app.MapGet("/api/options", async (CurrentUser current, Db db) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            var team = user.TeamId is null ? null : await db.Teams.Find(t => t.Id == user.TeamId).FirstOrDefaultAsync();
            return Results.Ok(team?.Options ?? TeamOptions.Defaults());
        }).RequireAuthorization();

        // Active tenant IDs (Stub Name) and their programs (Domain), A-Z by tenant.
        app.MapGet("/api/tenants", async (Db db) =>
        {
            var all = await db.Tenants.Find(t => t.IsActive).ToListAsync();
            return Results.Ok(all.OrderBy(t => t.TenantId, StringComparer.OrdinalIgnoreCase)
                .Select(t => new { tenantId = t.TenantId, programs = t.Programs }));
        }).RequireAuthorization();
    }
}
