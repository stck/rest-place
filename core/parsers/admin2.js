module.exports = (_line) => {
    let [countryCode, admin1code, admin2code] = _line[0].split('.');
    return {countryCode, admin1code, admin2code, name: _line[1], type: 'admin2'};
};