using MongoDB.Driver;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Endpoints;

public static class AuthEndpoints
{
    public record LoginRequest(string Email, string Password);
    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

    public static void Map(WebApplication app)
    {
        app.MapPost("/api/auth/login", async (LoginRequest req, Db db, TokenService tokens) =>
        {
            var email = (req.Email ?? "").Trim().ToLowerInvariant();
            var user = await db.Users.Find(u => u.Email == email).FirstOrDefaultAsync();
            // Same answer for an unknown email and a wrong password, so accounts can't be probed.
            if (user is null || !user.IsActive || !Passwords.Verify(req.Password ?? "", user.PasswordHash))
                return Http.Error(401, "That email and password don't match an active account.");
            return Results.Ok(new { token = tokens.Issue(user), user = UserDto.From(user) });
        }).RequireRateLimiting("login");

        var me = app.MapGroup("/api/me").RequireAuthorization();
        me.MapGet("/", async (CurrentUser current, Db db) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            var team = user.TeamId is null ? null : await db.Teams.Find(t => t.Id == user.TeamId).FirstOrDefaultAsync();
            return Results.Ok(new { user = UserDto.From(user), team = team is null ? null : TeamDto.From(team), serverNow = DateTime.UtcNow });
        });
        me.MapPost("/password", async (ChangePasswordRequest req, CurrentUser current, Db db) =>
        {
            var user = await current.GetAsync();
            if (user is null) return Http.Unauthorized();
            if (!Passwords.Verify(req.CurrentPassword ?? "", user.PasswordHash)) return Http.BadRequest("Your current password is wrong.");
            if ((req.NewPassword ?? "").Length < Passwords.MinLength) return Http.BadRequest($"Use at least {Passwords.MinLength} characters.");
            await db.Users.UpdateOneAsync(u => u.Id == user.Id, Builders<User>.Update.Set(u => u.PasswordHash, Passwords.Hash(req.NewPassword!)));
            return Results.Ok(new { ok = true });
        });
    }
}
