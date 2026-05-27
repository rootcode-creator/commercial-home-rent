require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const AmenityCategory = require('../models/amenityCategory.js');
const { defaultAmenityCategories } = require('../utils/amenityCatalog.js');

const dbUrl = process.env.ATLASDB_URL;

async function main() {
  await mongoose.connect(dbUrl);

  for (const category of defaultAmenityCategories) {
    await AmenityCategory.updateOne(
      { name: category.name },
      {
        $set: {
          name: category.name,
          order: category.order,
          items: category.items,
        },
      },
      { upsert: true }
    );
  }

  const total = await AmenityCategory.countDocuments();
  console.log(`Amenity categories seeded. Total categories: ${total}`);
}

main()
  .then(() => mongoose.connection.close())
  .catch((err) => {
    console.log(err);
    mongoose.connection.close();
    process.exitCode = 1;
  });