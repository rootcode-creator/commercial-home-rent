require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require("mongoose");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

// const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl = process.env.ATLASDB_URL;
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;
const DEFAULT_GEOMETRY = { type: 'Point', coordinates: [-74.005994, 40.712749] };
const OWNER_ID = "675f3fabe9d2e0af9439e36a";

async function main() {
  await mongoose.connect(dbUrl);
}

const getListingGeometry = async (listing) => {
  if (!geocodingClient) return DEFAULT_GEOMETRY;

  try {
    const response = await geocodingClient.forwardGeocode({
      query: `${listing.location}, ${listing.country}`,
      limit: 1,
    }).send();

    return response.body.features?.[0]?.geometry || DEFAULT_GEOMETRY;
  } catch (error) {
    return DEFAULT_GEOMETRY;
  }
};


const initDatabase = async () => {
  // Reset the entire database by listing and clearing every collection (preserve DB and indexes)
  const db = mongoose.connection.db;
  const colls = await db.listCollections().toArray();
  for (const { name } of colls) {
    // skip internal/system collections
    if (name.startsWith('system.')) continue;
    try {
      await db.collection(name).deleteMany({});
      // Cleared collection: logging removed for production
    } catch (err) {
      console.warn(`Failed clearing collection ${name}:`, err.message);
    }
  }
  // Ensure a default owner user exists and use that user's id for seeded listings
  const ownerData = {
    _id: new mongoose.Types.ObjectId(OWNER_ID),
    username: "shakil",
    email: "shakil@example.com",
    avatar: { url: "/images/default-user.png", filename: "default-user.png" },
    joinedAt: new Date(),
  };
  const owner = await User.findOneAndUpdate(
    { _id: ownerData._id },
    { $setOnInsert: ownerData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const ownerId = owner._id;
  // Default owner ensured: logging removed
  const seededListings = await Promise.all(
    initData.data.map(async (obj) => {
      const geometry = await getListingGeometry(obj);
      return { ...obj, owner: ownerId, geometry };
    })
  );
  await Listing.insertMany(seededListings);
  // Database initialized (log removed)


}

main()
  .then(() => {
    // Connected to database (log removed)
    return initDatabase();
  })
  .then(() => mongoose.connection.close())
  .catch((err) => {
    // Database init error (logging removed)
    mongoose.connection.close();
  });