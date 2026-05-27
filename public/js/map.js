
mapboxgl.accessToken = mapToken;
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: "mapbox://styles/mapbox/streets-v12",
    center: listing.geometry.coordinates, // starting position [lng, lat]. Note that lat must be set between -90 and 90
    zoom: 9 // starting zoom
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// Custom fullscreen control to ensure the icon and styling match the design
class CustomFullscreenControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        this._btn = document.createElement('button');
        this._btn.type = 'button';
        this._btn.className = 'custom-fullscreen-btn';
        this._btn.setAttribute('aria-label', 'Enter fullscreen');
        this._btn.title = 'Enter fullscreen';
        this._btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#222222" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5v4"/><path d="M15 3h4v4"/><path d="M5 15v4h4"/><path d="M19 15v4h-4"/><path d="M9 9L5 5"/><path d="M15 9l4-4"/><path d="M9 15l-4 4"/><path d="M15 15l4 4"/></svg>';

        this._btn.addEventListener('click', () => this._toggleFullscreen());
        this._container.appendChild(this._btn);

        // update label when fullscreen changes
        this._onFsChange = () => {
            if (document.fullscreenElement) {
                this._btn.setAttribute('aria-label', 'Exit fullscreen');
                this._btn.title = 'Exit fullscreen';
            } else {
                this._btn.setAttribute('aria-label', 'Enter fullscreen');
                this._btn.title = 'Enter fullscreen';
            }
        };
        document.addEventListener('fullscreenchange', this._onFsChange);

        return this._container;
    }

    onRemove() {
        document.removeEventListener('fullscreenchange', this._onFsChange);
        if (this._container.parentNode) this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }

    _toggleFullscreen() {
        const container = this._map.getContainer();
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) container.requestFullscreen();
            else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }
}

map.addControl(new CustomFullscreenControl(), 'top-right');
// Custom style switcher control
class MapStyleDropdownControl {
    constructor(options = []) { this._options = options; }
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        // do NOT include mapboxgl-ctrl-group so Mapbox won't merge buttons into a single pill
        this._container.className = 'mapboxgl-ctrl map-style-control';

        // toggle button
        this._toggle = document.createElement('button');
        this._toggle.type = 'button';
        this._toggle.className = 'map-style-toggle';
        this._toggle.setAttribute('aria-haspopup', 'true');
        this._toggle.setAttribute('aria-expanded', 'false');
        this._toggle.title = 'Map style';
        // closer stacked-layers icon (dark layers on light circular background)
        this._toggle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" fill-rule="evenodd"><polygon points="12 3 21 8 12 13 3 8" fill="#111"/><polygon points="12 8 21 13 12 18 3 13" fill="#1f2937" opacity="0.95"/><polygon points="12 12.5 21 17.5 12 22.5 3 17.5" fill="#374151" opacity="0.9"/></g></svg>';
        this._container.appendChild(this._toggle);

        // dropdown menu
        this._menu = document.createElement('div');
        this._menu.className = 'map-style-dropdown';
        this._menu.setAttribute('role', 'menu');
        this._options.forEach((opt, i) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'map-style-item';
            item.innerText = opt.label;
            item.dataset.style = opt.url;
            item.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this._selectStyle(opt.url, item); });
            if (i === 0) item.classList.add('active');
            this._menu.appendChild(item);
        });
        this._container.appendChild(this._menu);

        // events
        this._toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const expanded = this._toggle.getAttribute('aria-expanded') === 'true';
            this._toggle.setAttribute('aria-expanded', String(!expanded));
            this._menu.classList.toggle('open', !expanded);
        });

        // close on outside click
        this._onDocClick = (ev) => {
            if (!this._container.contains(ev.target)) {
                this._menu.classList.remove('open');
                this._toggle.setAttribute('aria-expanded', 'false');
            }
        };
        document.addEventListener('click', this._onDocClick);

        return this._container;
    }

    onRemove() {
        document.removeEventListener('click', this._onDocClick);
        if (this._container.parentNode) this._container.parentNode.removeChild(this._container);
    }

    _selectStyle(url, btn) {
        if (!this._map) return;
        Array.from(this._menu.querySelectorAll('.map-style-item')).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // close menu
        this._menu.classList.remove('open');
        this._toggle.setAttribute('aria-expanded', 'false');
        // set style and re-add marker after styledata
        this._map.setStyle(url);
        this._map.once('styledata', () => { if (typeof reAddMarker === 'function') reAddMarker(); });
    }
}

// register the dropdown control with style options
map.addControl(new MapStyleDropdownControl([
    { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { id: 'light', label: 'Light', url: 'mapbox://styles/mapbox/light-v10' }
]), 'top-right');

// Geolocate control
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserHeading: true
}), 'top-right');


// Create a custom black circular marker (Airbnb-style) element
const markerEl = document.createElement('div');
markerEl.className = 'custom-marker';
markerEl.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l9 7v7a2 2 0 0 1-2 2h-5v-7H10v7H5a2 2 0 0 1-2-2V10l9-7z" fill="#ffffff"/></svg>';

let marker = null;
function addMarker() {
    if (marker) marker.remove();
    marker = new mapboxgl.Marker(markerEl)
        .setLngLat(listing.geometry.coordinates)
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<h4>${listing.title}</h4><p>Exact location will be provided after booking.</p>`))
        .setOffset([0, -18])
        .addTo(map);
}

// Expose a reAddMarker hook used by style switcher
function reAddMarker() { addMarker(); }

// Add marker initially
addMarker();

map.on('load', () => {
    // Nothing needed here anymore for fullscreen icon replacement
});



