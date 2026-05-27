const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const amenityItemSchema = new Schema(
  {
    icon: {
      type: String,
      default: "fa-solid fa-circle-check",
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const amenityCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    items: {
      type: [amenityItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const AmenityCategory = mongoose.model("AmenityCategory", amenityCategorySchema);
module.exports = AmenityCategory;