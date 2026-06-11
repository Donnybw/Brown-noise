// Build a Google Static Maps satellite image URL.
// POST { lat, lng, size, zoom } -> { url }
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server API key not configured' }) };
    }

    let lat, lng, size, zoom;
    try {
        ({ lat, lng, size = 640, zoom = 19 } = JSON.parse(event.body || '{}'));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing lat/lng' }) };
    }

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}x${size}&maptype=satellite&scale=2&key=${apiKey}`;
    return { statusCode: 200, body: JSON.stringify({ url }) };
};
