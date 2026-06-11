// Geocode an address via Google Maps Geocoding API.
// POST { address } -> { lat, lng }
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server API key not configured' }) };
    }

    let address;
    try {
        ({ address } = JSON.parse(event.body || '{}'));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    if (!address) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing address' }) };
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: data.error_message || `Geocoding failed: ${data.status}` })
            };
        }

        const { lat, lng } = data.results[0].geometry.location;
        return { statusCode: 200, body: JSON.stringify({ lat, lng }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
