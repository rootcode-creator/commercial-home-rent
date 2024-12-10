const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema( {
    title: {
        type: String,
        required: true, 
    },
    description: String,
    image: { 
        type: String ,
        default: "https://avatars.githubusercontent.com/u/59122351?v=4",
        set: (v) => v === "" ? "https://avatars.githubusercontent.com/u/59122351?v=4" : v,
    },
    price: Number,
    location: String,
    country: String,
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review",
        },
    ],
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing; 