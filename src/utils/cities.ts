export interface City {
    name: string;
    latitude: number;
    longitude: number;
  }

export const majorCities: City[] = [
  {
    name: "Chicago_Illinois",
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    name: "Madison_Wisconsin",
    latitude: 43.0838,
    longitude: -89.4411,
  },
  {
    name: "Miami_Florida",
    latitude: 25.7617,
    longitude: -80.1918,
  },
  {
    name: "SaintLouis_Missouri",
    latitude: 38.6270,
    longitude: -90.1994,
  },
// ... add more major cities and their coordinates
];
