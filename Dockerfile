# One image that serves both the website and the API: docker build -t shiftpulse .
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Same address as the API, so no VITE_API_URL is needed.
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY api/ShiftPulse.Api/ShiftPulse.Api.csproj ShiftPulse.Api/
RUN dotnet restore ShiftPulse.Api/ShiftPulse.Api.csproj
COPY api/ShiftPulse.Api/ ShiftPulse.Api/
RUN dotnet publish ShiftPulse.Api/ShiftPulse.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=api /app .
COPY --from=web /web/dist ./wwwroot
EXPOSE 8080
USER app
# Render (and most hosts) pass the port in $PORT.
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} exec dotnet ShiftPulse.Api.dll"]
