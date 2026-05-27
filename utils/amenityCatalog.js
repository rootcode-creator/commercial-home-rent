const defaultAmenityCategories = [
  {
    name: "Bathroom",
    order: 1,
    items: [
      { icon: "fa-solid fa-wind", label: "Hair dryer" },
      { icon: "fa-solid fa-soap", label: "Shampoo" },
      { icon: "fa-solid fa-toilet", label: "Bidet" },
      { icon: "fa-solid fa-shower", label: "Hot water" },
      { icon: "fa-solid fa-soap", label: "Shower gel" },
    ],
  },
  {
    name: "Bedroom and laundry",
    order: 2,
    items: [
      { icon: "fa-solid fa-soap", label: "Washer" },
      { icon: "fa-solid fa-wind", label: "Dryer" },
      { icon: "fa-solid fa-box-open", label: "Essentials" },
      { icon: "fa-solid fa-bath", label: "Towels, bed sheets, soap, and toilet paper" },
      { icon: "fa-solid fa-shirt", label: "Hangers" },
      { icon: "fa-solid fa-bed", label: "Bed linens" },
      { icon: "fa-solid fa-box-archive", label: "Extra pillows and blankets" },
      { icon: "fa-solid fa-moon", label: "Room-darkening shades" },
      { icon: "fa-solid fa-shirt", label: "Iron" },
      { icon: "fa-solid fa-shirt", label: "Drying rack for clothing" },
      { icon: "fa-solid fa-box-archive", label: "Clothing storage" },
    ],
  },
  {
    name: "Entertainment",
    order: 3,
    items: [
      { icon: "fa-solid fa-tv", label: "TV" },
      { icon: "fa-solid fa-music", label: "Sound system" },
      { icon: "fa-solid fa-book", label: "Books and reading material" },
    ],
  },
  {
    name: "Heating and cooling",
    order: 4,
    items: [
      { icon: "fa-solid fa-snowflake", label: "Air conditioning" },
      { icon: "fa-solid fa-fan", label: "Ceiling fan" },
    ],
  },
  {
    name: "Privacy and safety",
    order: 5,
    items: [
      { icon: "fa-solid fa-door-closed", label: "Lock on bedroom door" },
      { icon: "fa-solid fa-circle-exclamation", label: "Smoke alarm" },
      { icon: "fa-solid fa-triangle-exclamation", label: "Carbon monoxide alarm" },
      { icon: "fa-solid fa-kit-medical", label: "First aid kit" },
    ],
  },
  {
    name: "Internet and office",
    order: 6,
    items: [
      { icon: "fa-solid fa-wifi", label: "Wifi" },
      { icon: "fa-solid fa-briefcase", label: "Dedicated workspace" },
    ],
  },
  {
    name: "Kitchen and dining",
    order: 7,
    items: [
      { icon: "fa-solid fa-kitchen-set", label: "Kitchen" },
      { icon: "fa-solid fa-utensils", label: "Space where guests can cook their own meals" },
      { icon: "fa-solid fa-snowflake", label: "Refrigerator" },
      { icon: "fa-solid fa-bolt", label: "Microwave" },
      { icon: "fa-solid fa-utensils", label: "Cooking basics" },
      { icon: "fa-solid fa-utensils", label: "Pots and pans, oil, salt and pepper" },
      { icon: "fa-solid fa-utensils", label: "Dishes and silverware" },
      { icon: "fa-solid fa-utensils", label: "Bowls, chopsticks, plates, cups, etc." },
      { icon: "fa-solid fa-fire", label: "Stove" },
      { icon: "fa-solid fa-mug-hot", label: "Hot water kettle" },
      { icon: "fa-solid fa-bread-slice", label: "Toaster" },
      { icon: "fa-solid fa-table", label: "Dining table" },
      { icon: "fa-solid fa-mug-saucer", label: "Coffee" },
    ],
  },
  {
    name: "Location features",
    order: 8,
    items: [
      { icon: "fa-solid fa-door-open", label: "Private entrance" },
      { icon: "fa-solid fa-building", label: "Separate street or building entrance" },
    ],
  },
  {
    name: "Parking and facilities",
    order: 9,
    items: [
      { icon: "fa-solid fa-car", label: "Free parking on premises" },
      { icon: "fa-solid fa-car", label: "Free street parking" },
      { icon: "fa-solid fa-elevator", label: "Elevator" },
      { icon: "fa-solid fa-building", label: "The home or building has an elevator that’s at least 52 inches deep and a doorway at least 32 inches wide" },
      { icon: "fa-solid fa-car-side", label: "Paid parking off premises" },
    ],
  },
  {
    name: "Services",
    order: 10,
    items: [
      { icon: "fa-solid fa-key", label: "Self check-in" },
      { icon: "fa-solid fa-lock", label: "Lockbox" },
    ],
  },
  {
    name: "Not included",
    order: 11,
    items: [
      { icon: "fa-solid fa-triangle-exclamation", label: "Unavailable: Exterior security cameras on propertyExterior security cameras on property" },
      { icon: "fa-solid fa-triangle-exclamation", label: "Unavailable: HeatingHeating" },
    ],
  },
];

module.exports = { defaultAmenityCategories };