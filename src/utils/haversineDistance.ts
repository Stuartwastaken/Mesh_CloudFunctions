/**
* Calculate the Haversine distance between two latitude and longitude points.
*
* @param {number} lat1 - The latitude of the first point.
* @param {number} lon1 - The longitude of the first point.
* @param {number} lat2 - The latitude of the second point.
* @param {number} lon2 - The longitude of the second point.
* @return {number} The Haversine distance in kilometers between the two points.
*/
export function haversineDistance(lat1: number, lon1: number,
    lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
       Math.sin(dLat / 2) * Math.sin(dLat / 2) +
       Math.cos(toRadians(lat1)) * Math.cos(
           toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


/**
*
* @param {number} degrees - The degree you would like to convert.
* @return {number} The radians equivalent of the degrees input.
*/
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
