class MapApp {
    constructor() {
        this.map = null;
        this.currentBaseLayer = null;
        this.currentDataLayer = null;
        
        this.markerCluster = null;
        this.lineLayerGroup = null;   
        this.multiLineLayerGroup = null;
        this.multiPointLayerGroup = null;
        this.multiPolygonLayerGroup = null;
        this.polygonLayerGroup = null;

        this.dataCache = {};
        this.currentLayerKey = null;
        this.allMarkers = {};
        this.filteredMarkers = {};
        this.availableProperties = new Set();
        this.sidebarVisible = true;
        this.uniqueValuesCache = {}; // Cache para valores únicos        
        // Configuración inicial de capas
        this.layerConfigs = layerConfigs;     
        
        this.init();
    }

    async init() {
        try {
            this.setupMap();
            this.setupEventListeners();
            this.renderLayerButtons();
            this.hideLoading();
            this.loadLayer(Object.keys(this.layerConfigs)[0]);
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Error al inicializar la aplicación');
            this.hideLoading();
        }
    }

    setupMap() {
        // Initialize map
        this.map = L.map('map', {
            center: [-33.45, -70.65],
            zoom: 10,
            zoomControl: true
        });

        // Base layers
        this.baseLayers = baseLayers;

        // Set default base layer
        this.currentBaseLayer = this.baseLayers.osm;
        this.currentBaseLayer.addTo(this.map);

        // Map events
        this.map.on('zoomend', () => {
            document.getElementById('zoom').textContent = this.map.getZoom();
        });
    }

    setupEventListeners() {
        // Base map buttons
        document.querySelectorAll('[data-map]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapType = e.target.closest('[data-map]').getAttribute('data-map');
                this.changeBaseMap(mapType);
            });
        });

        // Filter buttons
        document.getElementById('apply-filter').addEventListener('click', () => this.applyFilter());
        document.getElementById('clear-filter').addEventListener('click', () => this.clearFilter());
        
        
        // Nueva sección de Filtro por Selección
        document.getElementById('select-property').addEventListener('change', (e) => {
            this.handleSelectPropertyChange(e.target.value);
        });
        document.getElementById('apply-select-filter').addEventListener('click', () => this.applySelectFilter());
        document.getElementById('clear-select-filter').addEventListener('click', () => this.clearSelectFilter());
    }

    renderLayerButtons() {
        const container = document.getElementById('layer-buttons-container');
        container.innerHTML = '';

        Object.entries(this.layerConfigs).forEach(([key, config]) => {
            const btn = document.createElement('div');
            btn.className = 'btn layer-btn';
            btn.setAttribute('data-layer', key);
            btn.innerHTML = `<i class="fas fa-layer-group"></i> ${config.name}`;
            
            btn.addEventListener('click', () => {
                this.loadLayer(key);
            });

            container.appendChild(btn);
        });
    }

    changeBaseMap(mapType) {
        if (this.baseLayers[mapType]) {
            // Remove current base layer
            if (this.currentBaseLayer) {
                this.map.removeLayer(this.currentBaseLayer);
            }
            
            // Add new base layer
            this.currentBaseLayer = this.baseLayers[mapType];
            this.currentBaseLayer.addTo(this.map);
            
            // Update UI
            this.updateActiveButton('[data-map]', mapType);
        }
    }

    async loadLayer(layerKey) {
        const config = this.layerConfigs[layerKey];
        if (!config) {
            this.showError('Configuración de capa no encontrada');
            return;
        }

        try {
            // Show loading state
            this.setLayerLoading(layerKey, true);
            this.clearError();

            // Load data if not cached
            if (!this.dataCache[layerKey]) {
                const response = await fetch(config.url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                this.dataCache[layerKey] = data;
            }

            // Apply layer to map
            this.applyLayer(layerKey);
            
        } catch (error) {
            console.error(`Error loading layer ${layerKey}:`, error);
            this.showError(`Error al cargar ${config.name}: ${error.message}`);
        } finally {
            this.setLayerLoading(layerKey, false);
        }
    }

    clean_map(){
        // Remove existing data layer
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
        }
        // Remove existing layer
        if (this.lineLayerGroup) {
            this.map.removeLayer(this.lineLayerGroup);
        }
        // Remove existing layer
        if (this.multiLineLayerGroup) {
            this.map.removeLayer(this.multiLineLayerGroup);
        }
        // Remove existing layer
        if (this.multiPointLayerGroup) {
            this.map.removeLayer(this.multiPointLayerGroup);
        }
        // Remove existing layer
        if (this.multiPolygonLayerGroup) {
            this.map.removeLayer(this.multiPolygonLayerGroup);
        }
        // Eliminar capa previa si existe
        if (this.polygonLayerGroup) {
            this.map.removeLayer(this.polygonLayerGroup);
        }

    }

    pointLayer(config,data,layerKey){
        if (!data || !config) return;
        this.clean_map();        

        // Create new marker cluster
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: function (cluster) {
                return L.divIcon({
                    html: `<div style="background: ${config.color}; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 3px 10px rgba(0,0,0,0.2);">${cluster.getChildCount()}</div>`,
                    className: '',
                    iconSize: [40, 40]
                });
            }
        });

        // Reset markers and properties
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let pointCount = 0;

        // Process GeoJSON data
        if (data.type === 'FeatureCollection' && data.features) {
            data.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    const [lng, lat] = feature.geometry.coordinates;
                    
                    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                        const marker = L.circleMarker([lat, lng], {
                            radius: 7,
                            fillColor: config.color,
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        });

                        // Store feature properties in marker
                        marker.feature = feature;

                        // Add popup if properties exist
                        if (feature.properties) {
                            marker.bindPopup(this.createPopup(feature.properties, config.name));
                            
                            // Collect available properties
                            Object.keys(feature.properties).forEach(prop => {
                                this.availableProperties.add(prop);
                            });
                        }

                        this.markerCluster.addLayer(marker);
                        this.allMarkers[layerKey].push(marker);
                        pointCount++;
                    }
                }
            });
        }

        // Add cluster to map
        this.map.addLayer(this.markerCluster);

        // Update UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = pointCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Update property selectors
        this.updatePropertySelectors();

        // Reset selection filter
        this.resetSelectFilter();

        // Fit to bounds if first load
        if (this.markerCluster.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.markerCluster.getBounds(), { padding: [50, 50] });
            }, 100);
        }

    }

    geometryCollectionLayer(config, data, layerKey) {
        if (!data || !config) return;

        this.clean_map();      

        // Create new marker cluster
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: function (cluster) {
                return L.divIcon({
                    html: `<div style="background: ${config.color}; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 3px 10px rgba(0,0,0,0.2);">${cluster.getChildCount()}</div>`,
                    className: '',
                    iconSize: [40, 40]
                });
            }
        });

        // Reset markers and properties
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let pointCount = 0;

        // Process GeoJSON data
        if (data.type === 'FeatureCollection' && data.features) {
            data.features.forEach(feature => {
                if (!feature.geometry) return;

                const geometries = feature.geometry.type === 'GeometryCollection'
                    ? feature.geometry.geometries
                    : [feature.geometry];

                geometries.forEach(geometry => {
                    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
                        const [lng, lat] = geometry.coordinates;

                        if (!isNaN(lat) && !isNaN(lng)) {
                            const marker = L.circleMarker([lat, lng], {
                                radius: 7,
                                fillColor: config.color,
                                color: '#fff',
                                weight: 2,
                                opacity: 1,
                                fillOpacity: 0.9
                            });

                            // Store feature properties in marker
                            marker.feature = feature;

                            // Add popup if properties exist
                            if (feature.properties) {
                                marker.bindPopup(this.createPopup(feature.properties, config.name));
                                Object.keys(feature.properties).forEach(prop => {
                                    this.availableProperties.add(prop);
                                });
                            }

                            this.markerCluster.addLayer(marker);
                            this.allMarkers[layerKey].push(marker);
                            pointCount++;
                        }
                    }
                });
            });
        }

        // Add cluster to map
        this.map.addLayer(this.markerCluster);

        // Update UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = pointCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Update property selectors
        this.updatePropertySelectors();

        // Reset selection filter
        this.resetSelectFilter();

        // Fit to bounds if any point was added
        if (this.markerCluster.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.markerCluster.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }

    lineStringLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clean_map();
        // Create new layer group
        this.lineLayerGroup = L.featureGroup();


        // Reset storage and properties
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let lineCount = 0;

        // Process GeoJSON data
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                const geometry = feature.geometry;
                if (!geometry || geometry.type !== 'LineString') return;

                const coordinates = geometry.coordinates;
                if (!Array.isArray(coordinates) || coordinates.length < 2) return;

                // Convert to Leaflet LatLngs
                const latLngs = coordinates.map(coord => [coord[1], coord[0]]);

                const polyline = L.polyline(latLngs, {
                    color: config.color || '#3388ff',
                    weight: 4,
                    opacity: 0.8
                });

                polyline.feature = feature;

                // Bind popup if properties exist
                if (feature.properties) {
                    polyline.bindPopup(this.createPopup(feature.properties, config.name));
                    Object.keys(feature.properties).forEach(prop => {
                        this.availableProperties.add(prop);
                    });
                }

                this.lineLayerGroup.addLayer(polyline);
                this.allMarkers[layerKey].push(polyline);
                lineCount++;
            });
        }

        // Add group to map
        this.map.addLayer(this.lineLayerGroup);

        // Update UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = lineCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Update property selectors
        this.updatePropertySelectors();

        // Reset selection filter
        this.resetSelectFilter();

        // Fit bounds
        if (this.lineLayerGroup.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.lineLayerGroup.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }

    multiLineStringLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clean_map();       

        // Create a new feature group
        this.multiLineLayerGroup = L.featureGroup();

        // Reset storage and properties
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let multiLineCount = 0;

        // Process GeoJSON data
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                const geometry = feature.geometry;
                if (!geometry || geometry.type !== 'MultiLineString') return;

                const multiLineCoords = geometry.coordinates;
                if (!Array.isArray(multiLineCoords) || multiLineCoords.length === 0) return;

                multiLineCoords.forEach(lineCoords => {
                    const latLngs = lineCoords.map(coord => [coord[1], coord[0]]); // [lat, lng]

                    const polyline = L.polyline(latLngs, {
                        color: config.color || '#ff6600',
                        weight: 4,
                        opacity: 0.8
                    });

                    polyline.feature = feature;

                    // Bind popup if properties exist
                    if (feature.properties) {
                        polyline.bindPopup(this.createPopup(feature.properties, config.name));
                        Object.keys(feature.properties).forEach(prop => {
                            this.availableProperties.add(prop);
                        });
                    }

                    this.multiLineLayerGroup.addLayer(polyline);
                    this.allMarkers[layerKey].push(polyline);
                    multiLineCount++;
                });
            });
        }

        // Add to map
        this.map.addLayer(this.multiLineLayerGroup);

        // Update UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = multiLineCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Update property selectors
        this.updatePropertySelectors();

        // Reset selection filter
        this.resetSelectFilter();

        // Fit bounds
        if (this.multiLineLayerGroup.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.multiLineLayerGroup.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }

    multiPointLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clean_map();      

        // Crear nuevo cluster group
        this.multiPointLayerGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: function (cluster) {
                return L.divIcon({
                    html: `<div style="background: ${config.color}; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 3px 10px rgba(0,0,0,0.2);">${cluster.getChildCount()}</div>`,
                    className: '',
                    iconSize: [40, 40]
                });
            }
        });

        // Reset markers and properties
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let pointCount = 0;

        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                const geometry = feature.geometry;
                if (!geometry || geometry.type !== 'MultiPoint') return;

                const coordinates = geometry.coordinates;
                if (!Array.isArray(coordinates)) return;

                coordinates.forEach(coord => {
                    if (Array.isArray(coord) && coord.length === 2) {
                        const [lng, lat] = coord;

                        if (!isNaN(lat) && !isNaN(lng)) {
                            const marker = L.circleMarker([lat, lng], {
                                radius: 7,
                                fillColor: config.color,
                                color: '#fff',
                                weight: 2,
                                opacity: 1,
                                fillOpacity: 0.9
                            });

                            // Asigna la feature al marker
                            marker.feature = feature;

                            // Popup si hay propiedades
                            if (feature.properties) {
                                marker.bindPopup(this.createPopup(feature.properties, config.name));
                                Object.keys(feature.properties).forEach(prop => {
                                    this.availableProperties.add(prop);
                                });
                            }

                            this.multiPointLayerGroup.addLayer(marker);
                            this.allMarkers[layerKey].push(marker);
                            pointCount++;
                        }
                    }
                });
            });
        }

        // Agrega a mapa
        this.map.addLayer(this.multiPointLayerGroup);

        // Actualiza UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = pointCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Actualiza selectores
        this.updatePropertySelectors();

        // Reinicia filtros
        this.resetSelectFilter();

        // Fit bounds
        if (this.multiPointLayerGroup.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.multiPointLayerGroup.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }

    multiPolygonLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clean_map();     

        // Crear nuevo grupo de features
        this.multiPolygonLayerGroup = L.featureGroup();

        // Reset datos y propiedades
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let polygonCount = 0;

        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                const geometry = feature.geometry;
                if (!geometry || geometry.type !== 'MultiPolygon') return;

                const polygons = geometry.coordinates;
                if (!Array.isArray(polygons)) return;

                // Convierte a [lat, lng]
                const latlngs = polygons.map(polygon =>
                    polygon.map(ring =>
                        ring.map(coord => [coord[1], coord[0]])
                    )
                );

                const polygonLayer = L.polygon(latlngs, {
                    color: config.color || '#3388ff',
                    weight: 2,
                    fillOpacity: 0.5,
                    opacity: 1
                });

                polygonLayer.feature = feature;

                // Popup si hay propiedades
                if (feature.properties) {
                    polygonLayer.bindPopup(this.createPopup(feature.properties, config.name));
                    Object.keys(feature.properties).forEach(prop => {
                        this.availableProperties.add(prop);
                    });
                }

                this.multiPolygonLayerGroup.addLayer(polygonLayer);
                this.allMarkers[layerKey].push(polygonLayer);
                polygonCount++;
            });
        }

        // Añade capa al mapa
        this.map.addLayer(this.multiPolygonLayerGroup);

        // Actualiza UI
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = polygonCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Actualiza selectores
        this.updatePropertySelectors();

        // Reinicia filtros
        this.resetSelectFilter();

        // Zoom a los polígonos
        if (this.multiPolygonLayerGroup.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.multiPolygonLayerGroup.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }

    polygonLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clean_map();       

        // Crear nuevo grupo de polígonos
        this.polygonLayerGroup = L.featureGroup();

        // Limpiar referencias anteriores
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        this.availableProperties.clear();

        let polygonCount = 0;

        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                const geometry = feature.geometry;
                if (!geometry || geometry.type !== 'Polygon') return;

                const coordinates = geometry.coordinates;
                if (!Array.isArray(coordinates)) return;

                // Convertir a [lat, lng]
                const latlngs = coordinates.map(ring =>
                    ring.map(coord => [coord[1], coord[0]])
                );

                const polygonLayer = L.polygon(latlngs, {
                    color: config.color || '#3388ff',
                    weight: 2,
                    fillOpacity: 0.5,
                    opacity: 1
                });

                polygonLayer.feature = feature;

                // Popup si hay propiedades
                if (feature.properties) {
                    polygonLayer.bindPopup(this.createPopup(feature.properties, config.name));
                    Object.keys(feature.properties).forEach(prop => {
                        this.availableProperties.add(prop);
                    });
                }

                this.polygonLayerGroup.addLayer(polygonLayer);
                this.allMarkers[layerKey].push(polygonLayer);
                polygonCount++;
            });
        }

        // Agregar capa al mapa
        this.map.addLayer(this.polygonLayerGroup);

        // Actualizar interfaz
        this.currentLayerKey = layerKey;
        document.getElementById('pointCount').textContent = polygonCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        this.updateActiveButton('[data-layer]', layerKey);

        // Actualizar filtros y selectores
        this.updatePropertySelectors();
        this.resetSelectFilter();

        // Zoom a los polígonos
        if (this.polygonLayerGroup.getLayers().length > 0) {
            setTimeout(() => {
                this.map.fitBounds(this.polygonLayerGroup.getBounds(), { padding: [50, 50] });
            }, 100);
        }
    }




    

    applyLayer(layerKey) {
        const config = this.layerConfigs[layerKey];
        const data = this.dataCache[layerKey]; 
        const tipo = data?.features?.[0]?.geometry?.type;  
        /* 
        if (tipo == "Point") {
            this.pointLayer(config,data,layerKey);
        }
        if(tipo == "GeometryCollection"){
            this.geometryCollectionLayer(config,data,layerKey);
        }
        if(tipo == "LineString"){
            this.lineStringLayer(config,data,layerKey);
        }
        if(tipo == "MultiLineString"){
            this.multiLineStringLayer(config,data,layerKey);
        }
        if(tipo == "MultiPoint"){
            this.multiPointLayer(config,data,layerKey);
        }
        if(tipo == "MultiPolygon"){
            this.multiPolygonLayer(config,data,layerKey);
        }
        if(tipo == "Polygon"){
            this.polygonLayer(config,data,layerKey);
        }   
        */
        const layerHandlers = {
            Point: 'pointLayer',
            GeometryCollection: 'geometryCollectionLayer',
            LineString: 'lineStringLayer',
            MultiLineString: 'multiLineStringLayer',
            MultiPoint: 'multiPointLayer',
            MultiPolygon: 'multiPolygonLayer',
            Polygon: 'polygonLayer'
        };

        const handler = layerHandlers[tipo];
        if (handler && typeof this[handler] === 'function') {
            this[handler](config, data, layerKey);
        }

    }

    updatePropertySelectors() {
        // Actualizar ambos selectores de propiedades
        const filterSelect = document.getElementById('filter-property');
        const selectSelect = document.getElementById('select-property');
        
        filterSelect.innerHTML = '<option value="">Seleccione propiedad</option>';
        selectSelect.innerHTML = '<option value="">Seleccione propiedad</option>';
        
        this.availableProperties.forEach(prop => {
            const option1 = document.createElement('option');
            option1.value = prop;
            option1.textContent = prop;
            filterSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = prop;
            option2.textContent = prop;
            selectSelect.appendChild(option2);
        });
    }

    applyFilter() {
        if (!this.currentLayerKey || !this.allMarkers[this.currentLayerKey]) {
            this.showError('Primero seleccione una capa');
            return;
        }
        
        const property = document.getElementById('filter-property').value;
        const filterValue = document.getElementById('filter-value').value.toLowerCase().trim();
        
        if (!property) {
            this.showError('Seleccione una propiedad para filtrar');
            return;
        }
        
        if (!filterValue) {
            this.showError('Ingrese un valor para filtrar');
            return;
        }
        
        // Remove existing layer
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
        }
        
        // Create new cluster for filtered markers
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true
        });
        
        const config = this.layerConfigs[this.currentLayerKey];
        let filteredCount = 0;
        
        // Apply filter
        this.allMarkers[this.currentLayerKey].forEach(marker => {
            const properties = marker.feature?.properties || {};
            const propertyValue = String(properties[property] || '').toLowerCase();
            
            if (propertyValue.includes(filterValue)) {
                this.markerCluster.addLayer(marker);
                filteredCount++;
            }
        });
        
        // Add filtered cluster to map
        this.map.addLayer(this.markerCluster);
        
        // Update UI
        document.getElementById('pointCount').textContent = filteredCount.toLocaleString();
        
        if (filteredCount === 0) {
            this.showError('No se encontraron resultados con ese filtro');
        } else {
            this.clearError();
            this.map.fitBounds(this.markerCluster.getBounds(), { padding: [50, 50] });
        }
    }

    clearFilter() {
        if (!this.currentLayerKey || !this.allMarkers[this.currentLayerKey]) {
            return;
        }
        
        // Remove existing layer
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
        }
        
        // Create new cluster with all markers
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true
        });
        
        // Add all markers
        this.allMarkers[this.currentLayerKey].forEach(marker => {
            this.markerCluster.addLayer(marker);
        });
        
        // Add cluster to map
        this.map.addLayer(this.markerCluster);
        
        // Reset UI
        document.getElementById('filter-property').value = '';
        document.getElementById('filter-value').value = '';
        document.getElementById('pointCount').textContent = 
            this.allMarkers[this.currentLayerKey].length.toLocaleString();
        this.clearError();
    }

    // Nueva función para manejar cambio en la propiedad del filtro por selección
    handleSelectPropertyChange(property) {
        const valueSelect = document.getElementById('select-value');
        valueSelect.innerHTML = '<option value="">Cargando valores...</option>';
        valueSelect.disabled = true;
        
        if (!property || !this.currentLayerKey) {
            return;
        }
        
        // Verificar si ya tenemos los valores en cache
        const cacheKey = `${this.currentLayerKey}_${property}`;
        if (this.uniqueValuesCache[cacheKey]) {
            this.populateValueSelect(this.uniqueValuesCache[cacheKey]);
            return;
        }
        
        // Obtener valores únicos
        const uniqueValues = new Set();
        this.allMarkers[this.currentLayerKey].forEach(marker => {
            const properties = marker.feature?.properties || {};
            const value = properties[property];
            if (value !== null && value !== undefined && value !== '') {
                uniqueValues.add(value);
            }
        });
        
        // Ordenar valores
        const sortedValues = Array.from(uniqueValues).sort();
        
        // Almacenar en cache
        this.uniqueValuesCache[cacheKey] = sortedValues;
        
        // Actualizar el selector de valores
        this.populateValueSelect(sortedValues);
    }
    
    // Llenar el selector de valores con opciones
    populateValueSelect(values) {
        const valueSelect = document.getElementById('select-value');
        valueSelect.innerHTML = '<option value="">Seleccione valor</option>';
        
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            valueSelect.appendChild(option);
        });
        
        valueSelect.disabled = false;
    }
    
    // Aplicar el filtro por selección
    applySelectFilter() {
        const property = document.getElementById('select-property').value;
        const value = document.getElementById('select-value').value;
        
        if (!property || !value) {
            this.showError('Seleccione propiedad y valor');
            return;
        }
        
        // Remove existing layer
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
        }
        
        // Create new cluster for filtered markers
        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true
        });
        
        const config = this.layerConfigs[this.currentLayerKey];
        let filteredCount = 0;
        
        // Apply filter (exact match)
        this.allMarkers[this.currentLayerKey].forEach(marker => {
            const properties = marker.feature?.properties || {};
            const propertyValue = properties[property];
            
            if (String(propertyValue) === String(value)) {
                this.markerCluster.addLayer(marker);
                filteredCount++;
            }
        });
        
        // Add filtered cluster to map
        this.map.addLayer(this.markerCluster);
        
        // Update UI
        document.getElementById('pointCount').textContent = filteredCount.toLocaleString();
        
        if (filteredCount === 0) {
            this.showError('No se encontraron resultados con ese filtro');
        } else {
            this.clearError();
            this.map.fitBounds(this.markerCluster.getBounds(), { padding: [50, 50] });
        }
    }
    
    // Limpiar el filtro por selección
    clearSelectFilter() {
        // Resetear UI del filtro por selección
        document.getElementById('select-property').value = '';
        document.getElementById('select-value').innerHTML = '<option value="">Seleccione valor</option>';
        document.getElementById('select-value').disabled = true;
        
        // Limpiar filtros y mostrar todos los puntos
        this.clearFilter();
    }
    
    // Resetear el filtro por selección al cambiar de capa
    resetSelectFilter() {
        document.getElementById('select-property').value = '';
        document.getElementById('select-value').innerHTML = '<option value="">Seleccione valor</option>';
        document.getElementById('select-value').disabled = true;
    }

    createPopup(properties, layerName) {
        let content = `
            <div style="
                max-width: 280px;
                max-height: 320px;
                overflow-y: auto;
                border-radius: 12px;
                padding: 15px;
                background: linear-gradient(to bottom right, #ffffff, #f8f9fa);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                scrollbar-width: thin;
                scrollbar-color: #3498db #f1f8ff;
                border: 1px solid rgba(0, 0, 0, 0.08);
            ">
                <style>
                    ::-webkit-scrollbar {
                        width: 8px;
                    }
                    ::-webkit-scrollbar-thumb {
                        background-color: #3498db;
                        border-radius: 4px;
                    }
                    ::-webkit-scrollbar-track {
                        background-color: #f1f8ff;
                        border-radius: 4px;
                    }
                </style>
                <div style="display: flex; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #3498db, #2ecc71); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
                        <i class="fas fa-map-marker-alt" style="color: white; font-size: 16px;"></i>
                    </div>
                    <h4 style="margin: 0; color: #2c3e50; font-weight: 700;">${layerName}</h4>
                </div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
        `;

        const keys = Object.keys(properties);
        keys.forEach(key => {
            const value = properties[key];
            if (value !== null && value !== undefined && value !== '') {
                content += `
                    <div style="display: flex; gap: 8px;">
                        <div style="flex: 0 0 100px; font-weight: 600; color: #2c3e50;">${key}:</div>
                        <div style="flex: 1; color: #34495e;">${value}</div>
                    </div>
                `;
            }
        });

        content += `
                </div>
            </div>
        `;
        return content;
    }

    updateActiveButton(selector, activeValue) {
        document.querySelectorAll(selector).forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`${selector}[data-${selector.includes('map') ? 'map' : 'layer'}="${activeValue}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    setLayerLoading(layerKey, isLoading) {
        const btn = document.querySelector(`[data-layer="${layerKey}"]`);
        if (btn) {
            btn.classList.toggle('loading', isLoading);
        }
    }

    showError(message) {
        const container = document.getElementById('error-container');
        container.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-circle"></i> ${message}</div>`;
        setTimeout(() => this.clearError(), 5000);
    }

    clearError() {
        document.getElementById('error-container').innerHTML = '';
    }

    hideLoading() {
        setTimeout(() => {
            const loading = document.getElementById('loading');
            if (loading) {
                loading.classList.add('hidden');
            }
        }, 800);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.mapApp = new MapApp();
    //window.mapApp.loadLayer(window.mapApp.layerConfigs[0])
});