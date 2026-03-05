const DEFAULT_LATITUDE = 43.6510;
const DEFAULT_LONGITUDE = -79.3470;
const REFRESH_INTERVAL = 600000; // 10 minutes
const USE_24H_CLOCK = true;
const LOCATION_STORAGE_KEY = "weather_app_location_v1";

const ICON_BASE_PATH = "icons";
const WEATHER_STATE_CLASSES = ["clear", "overcast", "rain", "snow"];
const DAY_STATE_CLASSES = ["day", "night"];
const THEME_GRADIENTS = {
  "day-clear": ["#2e8bff", "#6ec3ff"],
  "day-overcast": ["#5f6d7a", "#8fa3b8"],
  "day-rain": ["#1e3c72", "#2a5298"],
  "day-snow": ["#c9e4ff", "#eaf6ff"],
  "night-clear": ["#050b14", "#0f1d2b", "#17293a"],
  "night-overcast": ["#090f16", "#182531"],
  "night-rain": ["#060d1f", "#102347"],
  "night-snow": ["#2e3a48", "#4a5d70"]
};
let currentLocation = loadSavedLocation();

const elements = {
  body: document.body,
  currentCard: document.getElementById("current-card"),
  locationLabel: document.getElementById("location-label"),
  currentTemp: document.getElementById("current-temp"),
  currentIcon: document.getElementById("current-icon"),
  currentCondition: document.getElementById("current-condition"),
  feelsLike: document.getElementById("feels-like"),
  wind: document.getElementById("wind"),
  humidity: document.getElementById("humidity"),
  highLow: document.getElementById("high-low"),
  precip: document.getElementById("precip"),
  sunrise: document.getElementById("sunrise"),
  sunset: document.getElementById("sunset"),
  forecastGrid: document.getElementById("forecast-grid"),
  errorMessage: document.getElementById("error-message"),
  clock: document.getElementById("clock"),
  changeLocationButton: document.getElementById("change-location")
};

initialize();

function initialize() {
  elements.locationLabel.textContent = currentLocation.name;
  setIconGraphic(elements.currentIcon, "clear-day.svg");
  elements.locationLabel.addEventListener("click", handleLocationChangeRequest);
  elements.changeLocationButton.addEventListener("click", handleLocationChangeRequest);
  updateClock();
  setInterval(updateClock, 60000);

  fetchWeather();
  setInterval(fetchWeather, REFRESH_INTERVAL);
}

async function fetchWeather() {
  try {
    setErrorState(false);

    const response = await fetch(buildWeatherUrl(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Weather request failed with status ${response.status}`);
    }

    const data = await response.json();
    renderWeather(data);
    elements.body.classList.add("loaded");
  } catch (error) {
    console.error(error);
    setErrorState(true);
  }
}

function buildWeatherUrl() {
  const params = new URLSearchParams({
    latitude: String(currentLocation.latitude),
    longitude: String(currentLocation.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,is_day,weather_code",
    current_weather: "true",
    daily: "weather_code,weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto"
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function renderWeather(data) {
  const current = data.current || {};
  const legacyCurrent = data.current_weather || {};
  const daily = data.daily || {};

  const weatherCode = coalesceNumber(current.weather_code, legacyCurrent.weathercode, 0);
  const isDay = Boolean(coalesceNumber(current.is_day, legacyCurrent.is_day, 1));

  const currentTemp = coalesceNumber(current.temperature_2m, legacyCurrent.temperature, null);
  const feelsLike = coalesceNumber(current.apparent_temperature, currentTemp, null);
  const humidity = coalesceNumber(current.relative_humidity_2m, null, null);
  const windSpeed = coalesceNumber(current.wind_speed_10m, legacyCurrent.windspeed, null);
  const windDirection = coalesceNumber(current.wind_direction_10m, legacyCurrent.winddirection, null);

  const highs = daily.temperature_2m_max || [];
  const lows = daily.temperature_2m_min || [];
  const precips = daily.precipitation_probability_max || [];
  const sunrises = daily.sunrise || [];
  const sunsets = daily.sunset || [];
  const forecastCodes = daily.weather_code || daily.weathercode || [];
  const forecastDates = daily.time || [];

  const locationName = currentLocation.name || deriveLocationName(data.timezone);

  elements.locationLabel.textContent = locationName;
  elements.currentTemp.innerHTML = `${formatTemperature(currentTemp)}&deg;`;
  elements.currentCondition.textContent = mapWeatherCodeToLabel(weatherCode);
  const currentIconFile = mapWeatherCodeToIcon(weatherCode, isDay);
  setIconGraphic(elements.currentIcon, currentIconFile);
  elements.currentIcon.setAttribute("aria-label", mapWeatherCodeToLabel(weatherCode));

  elements.feelsLike.innerHTML = `${formatTemperature(feelsLike)}&deg;`;
  elements.wind.textContent = formatWind(windSpeed, windDirection);
  elements.humidity.textContent = humidity == null ? "--%" : `${Math.round(humidity)}%`;

  const todayHigh = highs.length ? formatTemperature(highs[0]) : "--";
  const todayLow = lows.length ? formatTemperature(lows[0]) : "--";
  elements.highLow.innerHTML = `${todayHigh}&deg; / ${todayLow}&deg;`;
  elements.precip.textContent = precips.length ? `${Math.round(precips[0])}%` : "--%";
  elements.sunrise.textContent = sunrises.length ? formatClockTime(sunrises[0]) : "--:--";
  elements.sunset.textContent = sunsets.length ? formatClockTime(sunsets[0]) : "--:--";

  applyThemeClasses(weatherCode, isDay);
  renderForecast(forecastDates, forecastCodes, highs, lows);
}

function renderForecast(dates, codes, highs, lows) {
  elements.forecastGrid.innerHTML = "";

  const daysToRender = Math.min(7, dates.length, highs.length, lows.length);
  for (let i = 0; i < daysToRender; i += 1) {
    const weatherCode = coalesceNumber(codes[i], 0, 0);
    const dayLabel = formatDayLabel(dates[i]);
    const high = formatTemperature(highs[i]);
    const low = formatTemperature(lows[i]);
    const iconFile = mapWeatherCodeToIcon(weatherCode, true);
    const tile = document.createElement("article");
    tile.className = "forecast-tile";
    const dayElement = document.createElement("p");
    dayElement.className = "forecast-day";
    dayElement.textContent = dayLabel;

    const iconElement = document.createElement("span");
    iconElement.className = "forecast-icon weather-mask-icon";
    iconElement.setAttribute("aria-hidden", "true");
    setIconGraphic(iconElement, iconFile);

    const tempElement = document.createElement("p");
    tempElement.className = "forecast-temp";
    tempElement.innerHTML = `<span>${high}&deg;</span><span class="temp-low">${low}&deg;</span>`;

    tile.append(dayElement, iconElement, tempElement);

    elements.forecastGrid.appendChild(tile);
  }
}

function applyThemeClasses(code, isDay) {
  const dayState = isDay ? "day" : "night";
  const weatherState = mapWeatherCodeToTheme(code);

  elements.body.classList.remove(...DAY_STATE_CLASSES, ...WEATHER_STATE_CLASSES);
  elements.body.classList.add(dayState, weatherState);
  updateDynamicIconColor(dayState, weatherState);
}

function setErrorState(hasError) {
  elements.errorMessage.hidden = !hasError;
  if (hasError) {
    elements.currentCondition.textContent = "Weather data unavailable";
  }
}

function updateClock() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !USE_24H_CLOCK
  });

  elements.clock.textContent = formatter.format(now);
}

function setIconGraphic(element, iconFile) {
  const img = document.createElement("img");
  img.className = "svg-fallback-icon";
  img.src = `${ICON_BASE_PATH}/${iconFile}`;
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy";

  element.classList.add("icon-fallback");
  element.replaceChildren(img);
}

function updateDynamicIconColor(dayState, weatherState) {
  const key = `${dayState}-${weatherState}`;
  const colors = THEME_GRADIENTS[key] || THEME_GRADIENTS["day-clear"];
  const luminance = averageLuminance(colors);
  const darkIcon = luminance > 0.45;
  const iconColor = darkIcon ? "rgba(13, 25, 40, 0.94)" : "rgba(255, 255, 255, 0.96)";
  const fallbackFilter = darkIcon ? "none" : "invert(1) brightness(1.35)";
  elements.body.style.setProperty("--icon-color", iconColor);
  elements.body.style.setProperty("--icon-fallback-filter", fallbackFilter);
}

function averageLuminance(colors) {
  if (!colors.length) {
    return 0.5;
  }

  let total = 0;
  for (const color of colors) {
    total += relativeLuminance(hexToRgb(color));
  }
  return total / colors.length;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean;

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

function relativeLuminance({ r, g, b }) {
  const rgb = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function mapWeatherCodeToIcon(code, isDay) {
  if (code === 0) {
    return isDay ? "clear-day.svg" : "clear-night.svg";
  }

  if (code >= 1 && code <= 2) {
    return isDay ? "partly-cloudy-day.svg" : "partly-cloudy-night.svg";
  }

  if (code === 3) {
    return "overcast.svg";
  }

  if (code >= 45 && code <= 48) {
    return "fog.svg";
  }

  if (code >= 51 && code <= 55) {
    return "drizzle.svg";
  }

  if (code >= 61 && code <= 65) {
    return "rain-showers.svg";
  }

  if (code >= 71 && code <= 75) {
    return "snow.svg";
  }

  if (code >= 80 && code <= 82) {
    return "rain-showers.svg";
  }

  if (code === 95) {
    return "thunderstorm.svg";
  }

  return isDay ? "partly-cloudy-day.svg" : "partly-cloudy-night.svg";
}

function mapWeatherCodeToLabel(code) {
  if (code === 0) {
    return "Clear Sky";
  }

  if (code >= 1 && code <= 2) {
    return "Partly Cloudy";
  }

  if (code === 3) {
    return "Overcast";
  }

  if (code >= 45 && code <= 48) {
    return "Fog";
  }

  if (code >= 51 && code <= 55) {
    return "Drizzle";
  }

  if (code >= 61 && code <= 65) {
    return "Rain";
  }

  if (code >= 71 && code <= 75) {
    return "Snow";
  }

  if (code >= 80 && code <= 82) {
    return "Rain Showers";
  }

  if (code === 95) {
    return "Thunderstorm";
  }

  return "Variable Conditions";
}

function mapWeatherCodeToTheme(code) {
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82) || code === 95 || (code >= 51 && code <= 55)) {
    return "rain";
  }

  if (code >= 71 && code <= 75) {
    return "snow";
  }

  if (code === 3 || (code >= 45 && code <= 48)) {
    return "overcast";
  }

  return "clear";
}

function formatTemperature(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "--";
  }

  return Math.round(Number(value)).toString();
}

function formatWind(speed, direction) {
  if (speed == null || Number.isNaN(Number(speed))) {
    return "--";
  }

  const cardinal = formatWindDirection(direction);
  return `${Math.round(Number(speed))} km/h ${cardinal}`;
}

function formatWindDirection(direction) {
  if (direction == null || Number.isNaN(Number(direction))) {
    return "";
  }

  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const degrees = Number(direction);
  const index = Math.round(degrees / 45) % 8;
  return labels[index];
}

function formatClockTime(value) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !USE_24H_CLOCK
  });

  return formatter.format(date);
}

function formatDayLabel(dateValue) {
  if (!dateValue) {
    return "---";
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "---";
  }

  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}

function deriveLocationName(timezone) {
  if (!timezone || typeof timezone !== "string" || !timezone.includes("/")) {
    return `Lat ${currentLocation.latitude.toFixed(2)}, Lon ${currentLocation.longitude.toFixed(2)}`;
  }

  const city = timezone.split("/").pop().replace(/_/g, " ");
  return city;
}

async function handleLocationChangeRequest() {
  const initialValue = currentLocation.name || "";
  const input = window.prompt("Enter a city or address", initialValue);
  if (input == null) {
    return;
  }

  const query = input.trim();
  if (!query) {
    return;
  }

  try {
    elements.locationLabel.textContent = "Searching...";
    const nextLocation = await geocodeLocation(query);
    if (!nextLocation) {
      elements.locationLabel.textContent = currentLocation.name;
      window.alert("Location not found. Try a city and country (for example: Paris, France).");
      return;
    }

    currentLocation = nextLocation;
    persistLocation(currentLocation);
    elements.locationLabel.textContent = currentLocation.name;
    await fetchWeather();
  } catch (error) {
    console.error(error);
    elements.locationLabel.textContent = currentLocation.name;
    window.alert("Unable to change location right now.");
  }
}

async function geocodeLocation(query) {
  const params = new URLSearchParams({
    name: query,
    count: "1",
    language: "en",
    format: "json"
  });

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`);
  }

  const data = await response.json();
  const result = Array.isArray(data.results) ? data.results[0] : null;
  if (!result) {
    return null;
  }

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    name: formatGeocodeLabel(result)
  };
}

function formatGeocodeLabel(result) {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return parts.join(", ");
}

function loadSavedLocation() {
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) {
      return {
        latitude: DEFAULT_LATITUDE,
        longitude: DEFAULT_LONGITUDE,
        name: "Toronto"
      };
    }

    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude) && parsed.name) {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        name: parsed.name
      };
    }
  } catch (error) {
    console.error(error);
  }

  return {
    latitude: DEFAULT_LATITUDE,
    longitude: DEFAULT_LONGITUDE,
    name: "Toronto"
  };
}

function persistLocation(location) {
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  } catch (error) {
    console.error(error);
  }
}

function coalesceNumber(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }

    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}
