using Microsoft.VisualBasic.FileIO;
using MongoDB.Driver;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Endpoints;

public static class AdminEndpoints
{
    public record NewUserRequest(string Name, string Email, string Password, string Role, string? TeamId);
    public record UpdateUserRequest(string? Name, string? Role, string? TeamId, bool? IsActive, string? NewPassword);
    public record BulkPerson(string Name, string Email, string? Role);
    public record BulkRequest(string? TeamId, List<BulkPerson> People);
    public record BulkResult(string Name, string Email, string Role, string? Password, string Status);

    /// <summary>A readable temporary password: no look-alike characters (0/O, 1/l/I).</summary>
    public static string TempPassword()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        return new string(System.Security.Cryptography.RandomNumberGenerator.GetItems<char>(chars, 12));
    }

    public record TeamRequest(string Name, List<string>? ManagerIds, ShiftSettings? Shift, List<string>? ReportEmails);

    public static IResult? CheckNewUser(string? name, string? email, string? password)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 120) return Http.BadRequest("Enter a name.");
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || email.Length > 200) return Http.BadRequest("Enter a valid email.");
        if ((password ?? "").Length < Passwords.MinLength) return Http.BadRequest($"The password needs at least {Passwords.MinLength} characters.");
        return null;
    }

    static IResult? CheckShift(ShiftSettings? s)
    {
        if (s is null) return null;
        if (!TimeOnly.TryParse(s.Start, out _) || !TimeOnly.TryParse(s.End, out _)) return Http.BadRequest("Shift times look like 15:00.");
        if (s.RolloverHour is < 0 or > 12) return Http.BadRequest("The rollover hour must be between 0 and 12.");
        try { TimeZoneInfo.FindSystemTimeZoneById(s.TimeZone); } catch { return Http.BadRequest("Unknown time zone. Use one like Asia/Kolkata."); }
        return null;
    }

    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization("Admin");

        g.MapGet("/users", async (Db db) => Results.Ok((await db.Users.Find(_ => true).SortBy(u => u.Name).ToListAsync()).Select(UserDto.From)));

        g.MapPost("/users", async (NewUserRequest req, Db db) =>
        {
            if (CheckNewUser(req.Name, req.Email, req.Password) is { } bad) return bad;
            if (!Roles.All.Contains(req.Role)) return Http.BadRequest("Role must be Member, Manager or Admin.");
            var user = new User { Name = req.Name.Trim(), Email = req.Email.Trim().ToLowerInvariant(), PasswordHash = Passwords.Hash(req.Password), Role = req.Role, TeamId = string.IsNullOrEmpty(req.TeamId) ? null : req.TeamId };
            try { await db.Users.InsertOneAsync(user); }
            catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey) { return Http.Error(409, "Someone already uses that email."); }
            return Results.Ok(UserDto.From(user));
        });

        // Adds many people at once, each with a temporary password shown only in this response.
        g.MapPost("/users/bulk", async (BulkRequest req, Db db) =>
        {
            if (req.People is not { Count: > 0 and <= 500 }) return Http.BadRequest("Add between 1 and 500 people.");
            var results = new List<BulkResult>();
            foreach (var p in req.People)
            {
                var name = (p.Name ?? "").Trim();
                var email = (p.Email ?? "").Trim().ToLowerInvariant();
                var role = string.IsNullOrWhiteSpace(p.Role) ? Roles.Member : Roles.All.FirstOrDefault(r => r.Equals(p.Role.Trim(), StringComparison.OrdinalIgnoreCase));
                if (role is null) { results.Add(new(name, email, p.Role ?? "", null, "Skipped: role must be Member, Manager or Admin")); continue; }
                var password = TempPassword();
                if (CheckNewUser(name, email, password) is not null) { results.Add(new(name, email, role, null, "Skipped: needs a name and a valid email")); continue; }
                var user = new User { Name = name, Email = email, PasswordHash = Passwords.Hash(password), Role = role, TeamId = string.IsNullOrEmpty(req.TeamId) ? null : req.TeamId };
                try
                {
                    await db.Users.InsertOneAsync(user);
                    results.Add(new(name, email, role, password, "Added"));
                }
                catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
                {
                    results.Add(new(name, email, role, null, "Skipped: someone already uses this email"));
                }
            }
            return Results.Ok(results);
        });

        g.MapPatch("/users/{id}", async (string id, UpdateUserRequest req, CurrentUser current, Db db) =>
        {
            var user = await db.Users.Find(u => u.Id == id).FirstOrDefaultAsync();
            if (user is null) return Http.NotFound();
            var me = await current.GetAsync();
            if (req.Role is not null && !Roles.All.Contains(req.Role)) return Http.BadRequest("Role must be Member, Manager or Admin.");
            if (me!.Id == id && (req.IsActive == false || (req.Role is not null && req.Role != Roles.Admin)))
                return Http.BadRequest("You can't remove your own admin access.");
            if (req.NewPassword is not null && req.NewPassword.Length < Passwords.MinLength) return Http.BadRequest($"The password needs at least {Passwords.MinLength} characters.");
            if (!string.IsNullOrWhiteSpace(req.Name)) user.Name = req.Name.Trim();
            if (req.Role is not null) user.Role = req.Role;
            if (req.TeamId is not null) user.TeamId = req.TeamId == "" ? null : req.TeamId;
            if (req.IsActive is { } a) user.IsActive = a;
            if (req.NewPassword is not null) user.PasswordHash = Passwords.Hash(req.NewPassword);
            await db.Users.ReplaceOneAsync(u => u.Id == id, user);
            return Results.Ok(UserDto.From(user));
        });

        g.MapGet("/teams", async (Db db) => Results.Ok((await db.Teams.Find(_ => true).SortBy(t => t.Name).ToListAsync()).Select(TeamDto.From)));

        g.MapPost("/teams", async (TeamRequest req, Db db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name)) return Http.BadRequest("Enter a team name.");
            if (CheckShift(req.Shift) is { } bad) return bad;
            var team = new Team { Name = req.Name.Trim(), ManagerIds = req.ManagerIds ?? [], Shift = req.Shift ?? new(), ReportEmails = req.ReportEmails ?? [] };
            await db.Teams.InsertOneAsync(team);
            return Results.Ok(TeamDto.From(team));
        });

        g.MapPut("/teams/{id}", async (string id, TeamRequest req, Db db) =>
        {
            var team = await db.Teams.Find(t => t.Id == id).FirstOrDefaultAsync();
            if (team is null) return Http.NotFound();
            if (string.IsNullOrWhiteSpace(req.Name)) return Http.BadRequest("Enter a team name.");
            if (CheckShift(req.Shift) is { } bad) return bad;
            team.Name = req.Name.Trim();
            team.ManagerIds = req.ManagerIds ?? team.ManagerIds;
            team.Shift = req.Shift ?? team.Shift;
            team.ReportEmails = (req.ReportEmails ?? team.ReportEmails).Select(e => e.Trim()).Where(e => e.Contains('@')).Distinct().ToList();
            await db.Teams.ReplaceOneAsync(t => t.Id == id, team);
            return Results.Ok(TeamDto.From(team));
        });

        // Imports the tenant sheet (CSV). Only TenantId, Caption (program) and IsActive are kept;
        // every other column, including people's contact details, is ignored.
        g.MapPost("/tenants/import", async (IFormFile file, Db db) =>
        {
            if (file.Length is 0 or > 20_000_000) return Http.BadRequest("Upload a CSV file under 20 MB.");
            using var parser = new TextFieldParser(file.OpenReadStream()) { TextFieldType = FieldType.Delimited, HasFieldsEnclosedInQuotes = true };
            parser.SetDelimiters(",");
            var header = parser.ReadFields()?.Select(h => h.Trim().TrimStart('﻿')).ToList() ?? [];
            int Col(string name) => header.FindIndex(h => h.Equals(name, StringComparison.OrdinalIgnoreCase));
            int idCol = Col("TenantId"), capCol = Col("Caption"), progCol = Col("ProgramName"), activeCol = Col("IsActive");
            if (idCol < 0) return Http.BadRequest("The file needs a TenantId column.");
            var tenants = new Dictionary<string, Tenant>(StringComparer.Ordinal);
            while (!parser.EndOfData)
            {
                var row = parser.ReadFields();
                if (row is null || row.Length <= idCol) continue;
                var id = row[idCol].Trim();
                if (id == "") continue;
                var t = tenants.TryGetValue(id, out var existing) ? existing : tenants[id] = new Tenant { TenantId = id, IsActive = false };
                if (activeCol < 0 || (row.Length > activeCol && row[activeCol].Trim().Equals("true", StringComparison.OrdinalIgnoreCase))) t.IsActive = true;
                var program = capCol >= 0 && row.Length > capCol && row[capCol].Trim() != "" ? row[capCol].Trim()
                    : progCol >= 0 && row.Length > progCol ? row[progCol].Trim() : "";
                if (program != "" && !t.Programs.Contains(program)) t.Programs.Add(program);
            }
            if (tenants.Count == 0) return Http.BadRequest("No tenants found in the file.");
            await db.Tenants.BulkWriteAsync(tenants.Values.Select(t =>
                new ReplaceOneModel<Tenant>(Builders<Tenant>.Filter.Eq(x => x.TenantId, t.TenantId), t) { IsUpsert = true }));
            return Results.Ok(new { tenants = tenants.Count, active = tenants.Values.Count(t => t.IsActive) });
        }).DisableAntiforgery();
    }
}
