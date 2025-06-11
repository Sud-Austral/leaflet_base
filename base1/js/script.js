class MapApp {
    constructor() {
        this.map = null;
        this.currentBaseLayer = null;
        this.currentDataLayer = null;
        this.markerCluster = null;
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

    pointLayer(config,data,layerKey){
        if (!data || !config) return;

        // Remove existing data layer
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
        }

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

    multiPointLayer(config, data, layerKey) {
        if (!data || !config) return;
        
        // Limpiar capa existente
        this.clearExistingLayer(layerKey);

        // Configurar cluster
        this.markerCluster = L.markerClusterGroup({ /* ... configuracion ... */ });
        
        // Contadores y almacenamiento
        this.allMarkers[layerKey] = [];
        this.filteredMarkers[layerKey] = [];
        const newProperties = new Set();
        let featureCount = 0;

        data.features.forEach(feature => {
            const processPoint = coords => {
                const [lng, lat] = coords;
                if (!isNaN(lat) && !isNaN(lng)) {
                    const marker = L.circleMarker([lat, lng], { /* ... estilo ... */ });
                    this.setupFeature(marker, feature, config, newProperties);
                    this.markerCluster.addLayer(marker);
                    this.allMarkers[layerKey].push(marker);
                    featureCount++;
                }
            };

            if (feature.geometry.type === 'Point') {
                processPoint(feature.geometry.coordinates);
            } 
            else if (feature.geometry.type === 'MultiPoint') {
                feature.geometry.coordinates.forEach(processPoint);
            }
        });

        this.map.addLayer(this.markerCluster);
        this.finalizeLayer(config, layerKey, featureCount, newProperties);
    }


    // 2. Líneas y Multilíneas
    lineStringLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clearExistingLayer(layerKey);
        
        const layerGroup = L.layerGroup();
        const newProperties = new Set();
        let featureCount = 0;

        data.features.forEach(feature => {
            const createLine = coords => {
                const latLngs = coords.map(([lng, lat]) => [lat, lng]);
                const line = L.polyline(latLngs, {
                    color: config.color,
                    weight: 4,
                    opacity: 0.7
                });
                
                this.setupFeature(line, feature, config, newProperties);
                layerGroup.addLayer(line);
                featureCount++;
            };

            if (feature.geometry.type === 'LineString') {
                createLine(feature.geometry.coordinates);
            } 
            else if (feature.geometry.type === 'MultiLineString') {
                feature.geometry.coordinates.forEach(createLine);
            }
        });

        this.map.addLayer(layerGroup);
        this.layers[layerKey] = layerGroup;  // Almacenar referencia
        this.finalizeLayer(config, layerKey, featureCount, newProperties);
    }

    // 3. Polígonos y Multipolígonos
    polygonLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clearExistingLayer(layerKey);
        
        const layerGroup = L.layerGroup();
        const newProperties = new Set();
        let featureCount = 0;

        data.features.forEach(feature => {
            const createPolygon = coords => {
                const latLngs = coords.map(ring => 
                    ring.map(([lng, lat]) => [lat, lng])
                );
                
                const polygon = L.polygon(latLngs, {
                    fillColor: config.color,
                    color: '#3388ff',
                    weight: 2,
                    fillOpacity: 0.5
                });
                
                this.setupFeature(polygon, feature, config, newProperties);
                layerGroup.addLayer(polygon);
                featureCount++;
            };

            if (feature.geometry.type === 'Polygon') {
                createPolygon(feature.geometry.coordinates);
            } 
            else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(createPolygon);
            }
        });

        this.map.addLayer(layerGroup);
        this.layers[layerKey] = layerGroup;
        this.finalizeLayer(config, layerKey, featureCount, newProperties);
    }

    // 4. Colecciones de geometrías
    geometryCollectionLayer(config, data, layerKey) {
        if (!data || !config) return;
        this.clearExistingLayer(layerKey);
        
        const collectionGroup = L.layerGroup();
        const newProperties = new Set();
        let featureCount = 0;

        data.features.forEach(feature => {
            if (feature.geometry.type === 'GeometryCollection') {
                feature.geometry.geometries.forEach(geom => {
                    let layer = null;
                    
                    switch (geom.type) {
                        case 'Point':
                            const [lng, lat] = geom.coordinates;
                            layer = L.circleMarker([lat, lng], { /* ... estilo ... */ });
                            break;
                            
                        case 'LineString':
                            const latLngs = geom.coordinates.map(([lng, lat]) => [lat, lng]);
                            layer = L.polyline(latLngs, { color: config.color });
                            break;
                            
                        case 'Polygon':
                            const rings = geom.coordinates.map(ring => 
                                ring.map(([lng, lat]) => [lat, lng])
                            );
                            layer = L.polygon(rings, { fillColor: config.color });
                            break;
                    }
                    
                    if (layer) {
                        this.setupFeature(layer, feature, config, newProperties);
                        collectionGroup.addLayer(layer);
                        featureCount++;
                    }
                });
            }
        });

        this.map.addLayer(collectionGroup);
        this.layers[layerKey] = collectionGroup;
        this.finalizeLayer(config, layerKey, featureCount, newProperties);
    }

    // ----- Funciones auxiliares ----- //

    // Limpiar capa existente
    clearExistingLayer(layerKey) {
        if (this.layers[layerKey]) {
            this.map.removeLayer(this.layers[layerKey]);
            delete this.layers[layerKey];
        }
        if (this.markerCluster) {
            this.map.removeLayer(this.markerCluster);
            this.markerCluster = null;
        }
    }

    // Configurar características comunes
    setupFeature(layer, feature, config, propertiesSet) {
        layer.feature = feature;
        if (feature.properties) {
            layer.bindPopup(this.createPopup(feature.properties, config.name));
            Object.keys(feature.properties).forEach(prop => {
                propertiesSet.add(prop);
                this.availableProperties.add(prop);
            });
        }
    }

    // Finalizar carga de capa
    finalizeLayer(config, layerKey, featureCount, newProperties) {
        // Actualizar UI
        document.getElementById('featureCount').textContent = featureCount.toLocaleString();
        document.getElementById('current-layer-name').textContent = config.name;
        
        // Actualizar selectores de propiedades
        this.updatePropertySelectors();
        
        // Ajustar vista
        if (this.layers[layerKey].getBounds) {
            setTimeout(() => {
                this.map.fitBounds(this.layers[layerKey].getBounds(), { 
                    padding: [50, 50],
                    maxZoom: 12
                });
            }, 100);
        }
    }

    applyLayer(layerKey) {
        const config = this.layerConfigs[layerKey];
        const data = this.dataCache[layerKey];        
        if (data?.features?.[0]?.geometry?.type === "Point") {
            this.pointLayer(config,data,layerKey)
        }
        console.log(data?.features?.[0]?.geometry?.type)
        
        
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