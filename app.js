const express = require('express');
const path = require('path');
const logger = require('morgan');

const restPlace = require('./core/lookup');

restPlace.init(() => {
  console.log('Initialized');
});

const app = express();

app.use(logger('dev'));

app.use(function (req, res, next) {
  res.send(restPlace.lookup(req.query.key));
});

module.exports = app;
