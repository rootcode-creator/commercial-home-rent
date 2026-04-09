require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require("mongoose");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const initData = require("./data.js");
const Listing = require("../models/listing.js");

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
  await Listing.deleteMany({});
  const seededListings = await Promise.all(
    initData.data.map(async (obj) => {
      const geometry = await getListingGeometry(obj);
      return { ...obj, owner: OWNER_ID, geometry };
    })
  );
  await Listing.insertMany(seededListings);
  console.log("Database was initialized");


}

main()
  .then(() => {
    console.log("Connected to database");
    return initDatabase();
  })
  .then(() => mongoose.connection.close())
  .catch((err) => {
    console.log(err);
    mongoose.connection.close();
  });