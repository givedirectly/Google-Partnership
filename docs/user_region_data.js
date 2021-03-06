export {userRegionData};

/**
 * Map from Google Maps Polygon/Marker to ShapeData, so that on user-region
 * modifications we can track new notes values and write data back to database.
 * Data is added to this map on loading from the backend or on user creation,
 * and removed if the feature is deleted.
 */
const userRegionData = new Map();
