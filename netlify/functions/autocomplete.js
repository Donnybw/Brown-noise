// Address autocomplete via Google Places Autocomplete API.
// POST { input } -> { predictions: [{ description, place_id }] }
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server API key not configured' }) };
    }

    let input;
    try {
        ({ input } = JSON.parse(event.body || '{}'));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    if (!input) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing input' }) };
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        const predictions = (data.predictions || []).map(p => ({
            description: p.description,
            place_id: p.place_id
        }));

        return { statusCode: 200, body: JSON.stringify({ predictions }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
