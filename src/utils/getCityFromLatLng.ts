import {majorCities} from "../utils/cities";
import {haversineDistance} from "../utils/haversineDistance";

const searchRadius = 50; // Radius in km

/**
     * Retrieves the city name from a given latitude and
     * longitude using the Google Maps Geocoding API.
     * @param {number} latitude - The latitude of the location.
     * @param {number} longitude - The longitude of the location.
     * @return {Promise<string|null>} A Promise that resolves to the city name,
     *  or null if the city cannot be determined.
     */
export async function getCityFromLatLng(latitude: number, longitude: number):
    Promise<string | null> {
  for (const city of majorCities) {
    const distance = haversineDistance(latitude,
        longitude, city.latitude, city.longitude);
    if (distance <= searchRadius) {
      return city.name;
    }
  }

  return null;
}
