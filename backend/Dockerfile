# Local/dev container for the API (Kestrel; the Lambda hosting registration is a no-op here).
# Production does NOT use this image — the deploy workflow publishes Native AOT for linux-arm64 and
# ships the native executable to Lambda as `bootstrap`.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/Coffee.Api/Coffee.Api.csproj src/Coffee.Api/
RUN dotnet restore src/Coffee.Api/Coffee.Api.csproj

COPY src/ src/
RUN dotnet publish src/Coffee.Api/Coffee.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# curl is only here for the HEALTHCHECK (the aspnet image ships neither curl nor wget).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:5080
EXPOSE 5080
# Non-root user shipped with the .NET runtime images (5080 needs no privileges).
USER app
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -fsS http://localhost:5080/health || exit 1
ENTRYPOINT ["dotnet", "Coffee.Api.dll"]
