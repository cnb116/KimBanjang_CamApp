/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        dewalt: "#FEE12B",
        "mark-red": "#FF0000",
      },
    },
  },
  plugins: [],
};
