module.exports = (_line) => {
    return {
        selfCode: _line[0],
        name: _line[1],
        countryCode: _line[8],
        admin1code: _line[10],
        admin2code: _line[11],
        admin3code: _line[12],
        admin4code: _line[13],
        type: 'city',
    };
};