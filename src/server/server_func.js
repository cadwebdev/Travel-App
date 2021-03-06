/* eslint-disable import/no-self-import */
/* eslint-disable no-restricted-syntax */
const fetch = require('node-fetch');

/**
 * GEONAMES REQUEST
 */

let possiblePlaces = [];
/**
 * Request data for a given place name from API geonames.
 * @param {*} req
 * @param {string} req.body.name place name
 * @param {*} res
 * @return {Array<{toponymName: string, countryName: string, lng: number, lat: number}>} possiblePlaces, array with objects containing geoname data
 */
exports.requestGeonamesData = async function(req, res) {
  possiblePlaces = [];

  // retrieve data from geonames
  let url = `http://api.geonames.org/searchJSON?username=${process.env.usernameGeonames}`;
  const { name } = req.body;

  url = `${url}&name_equals=${name}`;
  const response = await fetch(url);
  try {
    const data = await response.json();
    let counter = 0;
    let addPlace = true;
    // filter data, delete datapoints of which the latitude and longitude values are close together
    // eslint-disable-next-line no-restricted-syntax
    for (const datapoint of data.geonames) {
      // eslint-disable-next-line no-restricted-syntax
      for (const place of possiblePlaces) {
        if (
          Math.abs(place.lat - datapoint.lat) < 15.0 &&
          place.countryName === datapoint.countryName
        ) {
          addPlace = false;
        } else if (
          Math.abs(place.lng - datapoint.lng) < 15.0 &&
          place.countryName === datapoint.countryName
        ) {
          addPlace = false;
        }
      }

      if (addPlace) {
        const { toponymName, countryName, lng, lat } = datapoint;
        possiblePlaces[counter] = {
          toponymName,
          countryName,
          lng,
          lat
        };
        counter += 1;
      }
      addPlace = true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e.toString());
  }
  res.send(possiblePlaces);
};

// app.post('/geonames', requestGeonamesData);

/**
 * DARK SKY API
 */

// request average high and low temperature for trip start
exports.weatherForecast = async function(tripDate, latitude, longitude) {
  const tripDateSeconds = new Date(tripDate).getTime() / 1000;
  const url = `https://api.darksky.net/forecast/${process.env.API_KEY_DARK_SKY}/${latitude},${longitude},${tripDateSeconds}?exclude=currently,minutely,hourly,alerts`;
  const weatherforcast = await fetch(url);
  let result = {};
  try {
    const response = await weatherforcast.json();
    result = {
      tempHigh: response.daily.data[0].temperatureHigh,
      tempLow: response.daily.data[0].temperatureLow
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e.toString());
  }
  return result;
};

// app.post('/forecast', weatherForecast);

/**
 *  PIXABAY  API
 */

// request a picture for a given place, if not available then country
async function getPictures(place, country) {
  let url = `https://pixabay.com/api/?key=${process.env.API_KEY_PIXABAY}&q=${place},${country}&safesearch=true`;
  let pixabay = await fetch(url);
  let response = {};
  let result = {};
  try {
    response = await pixabay.json();
    result = { picURL: response.hits[0].webformatURL };
  } catch (e1) {
    try {
      url = `https://pixabay.com/api/?key=${process.env.API_KEY_PIXABAY}&q=${country}&safesearch=true`;
      pixabay = await fetch(url);
      response = await pixabay.json();
      result = { picURL: response.hits[0].webformatURL };
    } catch (e2) {
      // eslint-disable-next-line no-console
      console.log(`(${e1.toString()}) and (${e2.toString()})`);
    }
  }
  return result;
}

/**
 * HELPER FUNCTIONS
 */
const plannedDestinations = [];
let counterTripId = 0;

// app data array planned destionations contains core trip data
// changing data, such as weather and pic link are not stored,
// but requested each time the homepage reloads
exports.saveNewTrip = function(req, res) {
  const { index } = req.body;
  const newEntry = {
    destination: possiblePlaces[index].toponymName,
    date: req.body.date,
    country: possiblePlaces[index].countryName,
    lng: possiblePlaces[index].lng,
    lat: possiblePlaces[index].lat,
    id: counterTripId
  };
  plannedDestinations.push(newEntry);
  counterTripId += 1;
  res.send(true);
};

// app.post('/saveTrip', saveNewTrip);

// delete upcoming trip
exports.deleteUpcomingTrip = function(req, res) {
  const tripId = req.body.id;
  let counter = 0;
  for (const trip of plannedDestinations) {
    if (trip.id === tripId) {
      plannedDestinations.splice(counter, 1);
    }
    counter += 1;
  }
  res.send({ deletedTripId: tripId });
};
// app.post('/deleteTrip', deleteUpcomingTrip);

// future trips, enriched with weather and picture data
exports.getFutureTrips = async function(_req, res) {
  const today = new Date();
  let tripDate;
  let differenceInTime;
  const fullTripData = [];
  const differenceInDays = [];
  const requestWeather = [];
  const requestPic = [];

  for (const trip of plannedDestinations) {
    // To set two dates to two variables
    tripDate = new Date(trip.date);

    // To calculate the time difference of two dates
    differenceInTime = tripDate.getTime() - today.getTime();

    // To calculate the no. of days between two dates
    differenceInDays.push(Math.floor(differenceInTime / (1000 * 3600 * 24)));

    // eslint-disable-next-line import/no-self-import
    // eslint-disable-next-line global-require
    const func = require('./server_func');
    requestWeather.push(func.weatherForecast(tripDate, trip.lat, trip.lng));
    requestPic.push(getPictures(trip.destination, trip.country));
  }

  const responseWeather = await Promise.all(requestWeather);
  const responsePic = await Promise.all(requestPic);

  let counter = 0;
  for (const trip of plannedDestinations) {
    try {
      const newEntry = {
        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        ...trip,
        daysUntilTripStart: differenceInDays[counter],
        temperatureHigh: responseWeather[counter].tempHigh,
        temperatureLow: responseWeather[counter].tempLow,
        picURL: responsePic[counter].picURL
      };
      fullTripData.push(newEntry);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e.toString());
    }
    counter += 1;
  }
  res.send(fullTripData);
};

// app.post('/futureTrips', getFutureTrips);
