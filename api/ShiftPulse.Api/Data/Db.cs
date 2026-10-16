using MongoDB.Driver;
using ShiftPulse.Api.Models;

namespace ShiftPulse.Api.Data;

public class Db
{
    public IMongoCollection<User> Users { get; }
    public IMongoCollection<Team> Teams { get; }
    public IMongoCollection<Ticket> Tickets { get; }
    public IMongoCollection<Tenant> Tenants { get; }
    public IMongoCollection<AuditEntry> Audit { get; }

    public Db(AppSettings settings)
    {
        var db = new MongoClient(settings.MongoUri).GetDatabase(settings.MongoDatabase);
        Users = db.GetCollection<User>("users");
        Teams = db.GetCollection<Team>("teams");
        Tickets = db.GetCollection<Ticket>("tickets");
        Tenants = db.GetCollection<Tenant>("tenants");
        Audit = db.GetCollection<AuditEntry>("auditLog");
    }

    public async Task EnsureIndexesAsync()
    {
        await Users.Indexes.CreateOneAsync(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Email), new CreateIndexOptions { Unique = true }));
        await Tickets.Indexes.CreateManyAsync([
            new CreateIndexModel<Ticket>(Builders<Ticket>.IndexKeys.Ascending(t => t.UserId).Ascending(t => t.ShiftDate)),
            new CreateIndexModel<Ticket>(Builders<Ticket>.IndexKeys.Ascending(t => t.TeamId).Ascending(t => t.ShiftDate)),
            new CreateIndexModel<Ticket>(Builders<Ticket>.IndexKeys.Ascending(t => t.State).Ascending(t => t.ShiftDate)),
        ]);
    }
}
