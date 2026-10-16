using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using ShiftPulse.Api.Data;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Auth;

public static class Passwords
{
    public const int MinLength = 8;
    public static string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, workFactor: 11);
    public static bool Verify(string password, string hash) =>
        !string.IsNullOrEmpty(hash) && BCrypt.Net.BCrypt.Verify(password, hash);
}

public class TokenService(AppSettings settings)
{
    public SymmetricSecurityKey Key { get; } = new(Encoding.UTF8.GetBytes(settings.JwtSecret));

    public string Issue(User user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(ClaimTypes.Role, user.Role),
            new(JwtRegisteredClaimNames.Name, user.Name),
        };
        var token = new JwtSecurityToken(
            issuer: "shiftpulse",
            audience: "shiftpulse",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(settings.TokenHours),
            signingCredentials: new SigningCredentials(Key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

/// <summary>
/// Loads the signed-in user from the database on every request, so a deactivated account or a
/// changed role takes effect straight away instead of when the token expires.
/// </summary>
public class CurrentUser(IHttpContextAccessor http, Db db)
{
    private User? _user;
    private bool _loaded;

    public async Task<User?> GetAsync()
    {
        if (_loaded) return _user;
        _loaded = true;
        var id = http.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                 ?? http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id is null) return null;
        var user = await db.Users.Find(u => u.Id == id).FirstOrDefaultAsync();
        _user = user is { IsActive: true } ? user : null;
        return _user;
    }
}
