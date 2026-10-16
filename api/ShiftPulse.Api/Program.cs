using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using ShiftPulse.Api;
using ShiftPulse.Api.Auth;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Endpoints;
using ShiftPulse.Api.Models;
using ShiftPulse.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Settings come from the "App" section, or environment variables like App__MongoUri.
var settings = builder.Configuration.GetSection("App").Get<AppSettings>() ?? new AppSettings();
if (settings.JwtSecret.Length < 32)
    throw new InvalidOperationException("Set App__JwtSecret to a random value of at least 32 characters.");

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<TokenService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<TicketService>();
builder.Services.AddScoped<ReportService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = "shiftpulse",
        ValidAudience = "shiftpulse",
        IssuerSigningKey = new TokenService(settings).Key,
        RoleClaimType = System.Security.Claims.ClaimTypes.Role,
        NameClaimType = "name",
        ClockSkew = TimeSpan.FromMinutes(2),
    };
});
// Roles in the token are a first check; every endpoint also reloads the user from the database.
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Manager", p => p.RequireRole(Roles.Manager, Roles.Admin))
    .AddPolicy("Admin", p => p.RequireRole(Roles.Admin));

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(settings.CorsOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    .AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { ok = true, time = DateTime.UtcNow }));
AuthEndpoints.Map(app);
TicketEndpoints.Map(app);
OptionEndpoints.Map(app);
ManageEndpoints.Map(app);
AdminEndpoints.Map(app);
JobEndpoints.Map(app);

await Seed.RunAsync(app.Services.GetRequiredService<Db>(), settings, app.Logger);

app.Run();

public partial class Program;

static class Seed
{
    /// <summary>On a brand-new database: indexes, a first team and the first admin account.</summary>
    public static async Task RunAsync(Db db, AppSettings settings, ILogger log)
    {
        await db.EnsureIndexesAsync();
        if (await db.Users.CountDocumentsAsync(_ => true) > 0) return;
        if (string.IsNullOrWhiteSpace(settings.BootstrapAdminEmail) || (settings.BootstrapAdminPassword ?? "").Length < Passwords.MinLength)
        {
            log.LogWarning("No users yet. Set App__BootstrapAdminEmail and App__BootstrapAdminPassword (8+ characters) to create the first admin.");
            return;
        }
        var team = new Team { Name = "My team" };
        await db.Teams.InsertOneAsync(team);
        var admin = new User
        {
            Name = settings.BootstrapAdminName,
            Email = settings.BootstrapAdminEmail.Trim().ToLowerInvariant(),
            PasswordHash = Passwords.Hash(settings.BootstrapAdminPassword!),
            Role = Roles.Admin,
            TeamId = team.Id,
        };
        await db.Users.InsertOneAsync(admin);
        await db.Teams.UpdateOneAsync(t => t.Id == team.Id, Builders<Team>.Update.Push(t => t.ManagerIds, admin.Id));
        log.LogInformation("Created the first admin {Email} and the team \"My team\".", admin.Email);
    }
}
