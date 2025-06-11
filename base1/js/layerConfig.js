const layerConfigs = {
    malla: {
        url: 'https://raw.githubusercontent.com/Sud-Austral/leaflet_base/refs/heads/main/data/Malla_SanMiguel.json',
        name: 'Malla San Miguel',
        color: '#3498db',
        icon: '📍'
    },
    segunda: {
        url: 'https://raw.githubusercontent.com/Sud-Austral/leaflet_base/refs/heads/main/data/segunda_base.json',
        name: 'Segunda Base',
        color: '#2ecc71',
        icon: '🎯'
    },
    tercera: {
        url: 'https://raw.githubusercontent.com/Sud-Austral/leaflet_base/refs/heads/main/data/segunda_base.json',
        name: 'Tercera Base',
        color: '#e74c3c',
        icon: '🚀'
    },
    tercera1: {
        url: 'https://raw.githubusercontent.com/Sud-Austral/leaflet_base/refs/heads/main/data/segunda_base.json',
        name: 'Tercera Base1',
        color: '#e14c3c',
        icon: '🚀'
    },
    malla2: {
        url: 'https://raw.githubusercontent.com/Sud-Austral/leaflet_base/refs/heads/main/data/Malla_SanMiguel.json',
        name: 'Malla San Miguel',
        color: '#34f8db',
        icon: '📍'
    }
}

const baseLayers = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri'
        }),
        /*
        terrain: L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png', {
            attribution: '© Stamen Design'
        }),
        
        terrain: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO'
        }),
        */
        terrain: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri — Source: Esri, USGS, NOAA'
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© CARTO'
        })
    }