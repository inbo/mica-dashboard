function truncateString(str, num) {
    if (str.length > num) {
        return str.slice(0, num) + "...";
    } else {
        return str;
    }
}

const range = (start, end) => Array.from({length: end - start}, (v, k) => k + start);

Vue.component('bar-chart', {
    props: {
        barData: {
            // Data must be sorted before being passed to the chart
            required: true,
            type: Array,
        },
        numberOfXTicks: {
            type: Number,
            default: 15,
        },
    },
    data: function () {
        return {
            svgStyle: {
                margin: {
                    top: 10,
                    right: 30,
                    bottom: 30,
                    left: 40,
                },
                width: 1400,
                height: 170,
            },
            numberOfMonths: 36,
        };
    },
    computed: {
        truncatedBarData() {
            return this.barData.filter(e =>
                this.xScaleDomain.includes(e.yearMonth)
            );
        },
        xScaleDomain() {
            function* months(interval) {
                let cursor = interval.start.startOf("month");
                while (cursor < interval.end) {
                    yield cursor;
                    cursor = cursor.plus({months: 1});
                }
            }

            const interval = luxon.Interval.fromDateTimes(this.startDate, this.endDate);

            return Array.from(months(interval)).map((m) =>
                this.datetimeToMonthStr(m)
            );
        },
        xScale() {
            return d3.scaleBand()
                .range([0, this.svgInnerWidth])
                .paddingInner(0.3)
                .domain(this.xScaleDomain);
        },
        yScale() {
            return d3.scaleLinear()
                .rangeRound([this.svgInnerHeight, 0])
                .domain([0, this.dataMax]);
        },
        endDate() {
            return luxon.DateTime.now();
        },
        startDate() {
            return this.endDate.minus({month: this.numberOfMonths});
        },
        svgInnerHeight: function () {
            return (
                this.svgStyle.height -
                this.svgStyle.margin.top -
                this.svgStyle.margin.bottom
            );
        },
        svgInnerWidth: function () {
            return (
                this.svgStyle.width -
                this.svgStyle.margin.left -
                this.svgStyle.margin.right
            );
        },
        dataMax() {
            const maxVal = d3.max(
                this.truncatedBarData,
                d => {
                    return d.count;
                }
            );
            return maxVal ? maxVal : 0;
        },
    },
    methods: {
        datetimeToMonthStr(d) {
            return d.year + "-" + d.month;
        },
    },
    directives: {
        yaxis: {
            update(el, binding) {
                const scaleFunction = binding.value.scale;

                // Filter out non-integer values
                const yAxisTicks = scaleFunction.ticks(4).filter(tick => Number.isInteger(tick));

                // Create the axis and render it
                const yAxis = d3.axisLeft(scaleFunction).tickValues(yAxisTicks)
                yAxis(d3.select(el));
            },
        },
        xaxis: {
            update(el, binding) {
                const scaleFunction = binding.value.scale;
                const numberOfTicks = binding.value.ticks;
                const numberofElems = scaleFunction.domain().length;
                const moduloVal = Math.floor(numberofElems / numberOfTicks);

                const d3Axis = d3.axisBottom(scaleFunction).tickValues(
                    scaleFunction.domain().filter(function (d, i) {
                        return !(i % moduloVal);
                    })
                );
                d3Axis(d3.select(el));
            },
        },
    },
    template: `
        <svg
            class="d-block mx-auto"
            :width="svgStyle.width"
            :height="svgStyle.height"
        >
        <g :transform="'translate(' + svgStyle.margin.left.toString() + ', ' +  svgStyle.margin.top.toString() + ')'">
            <rect
                v-for="(barDataEntry, index) in truncatedBarData"
                :key="barDataEntry.yearMonth"
                :x="xScale(barDataEntry.yearMonth)"
                :y="yScale(barDataEntry.count)"
                :width="xScale.bandwidth()"
                :height="svgInnerHeight - yScale(barDataEntry.count)"
                :style="{ fill: 'rgb(36,45,102)' }"
            ></rect>
            
            <g v-yaxis="{ scale: yScale }" />
            
            <g :transform="'translate(0, ' + svgInnerHeight + ')'">
                <g v-xaxis="{ scale: xScale, ticks: numberOfXTicks }" />
            </g>
        </g>
            
        </svg>`,
});

Vue.component('dashboard-histogram', {
    props: {
        'filters': {
            type: Object,
            required: true
        },
        'monthlyCountersUrl': {
            type: String,
            required: true
        },
    },
    data: function () {
        return {
            histogramDataFromServer: [],
        }
    },
    computed: {
        preparedHistogramData: function () {
            return this.histogramDataFromServer.map((e) => {
                return {
                    yearMonth: e.year + "-" + e.month,
                    count: e.count,
                };
            });
        },
    },
    methods: {
        buildEmptyHistogramArray: function (rangeStart) {
            // first entry: first month with data from server
            // Last entry: current month
            let data = [];
            const yearsRange = range(rangeStart.year, luxon.DateTime.now().year + 1);
            yearsRange.forEach((currentYear, yearIndex) => {
                const startMonth = yearIndex === 0 ? rangeStart.month : 1;
                const endMonth =
                    yearIndex === yearsRange.length - 1 ? luxon.DateTime.now().month : 12;

                for (
                    let currentMonth = startMonth;
                    currentMonth <= endMonth;
                    currentMonth++
                ) {
                    data.push({
                        year: currentYear,
                        month: currentMonth,
                        count: 0,
                    });
                }
            });
            return data;
        },
        loadHistogramData: function (filters) {
            let vm = this;

            // The histogram has to drop the date filtering parameters
            const strippedFilters = (({startDate, endDate, ...o}) => o)(filters);

            $.ajax({
                url: this.monthlyCountersUrl,
                data: strippedFilters
            }).done(function (data) {
                if (data.length === 0) {
                    vm.histogramDataFromServer = [];
                } else {
                    // Build an empty range (padding)
                    let emptyHistogramData = vm.buildEmptyHistogramArray(
                        data[0]
                    );

                    // Populate it
                    data.forEach(serverEntry => {
                        const index = emptyHistogramData.findIndex(function (elem) {
                            return (
                                elem.year === serverEntry.year &&
                                elem.month === serverEntry.month
                            );
                        });
                        emptyHistogramData[index].count = serverEntry.count;
                    });

                    vm.histogramDataFromServer = emptyHistogramData;
                }
            })
        }
    },
    watch: {
        'filters': {
            deep: true,
            immediate: true,
            handler: function (filters) {
                this.loadHistogramData(filters);
            }
        }
    },
    template: `
        <div class="chart-container">
            <h2>Trend over time</h2>
            <bar-chart :bar-data="preparedHistogramData" />
        </div>`,
});

Vue.component('dashboard-occurrence-counter', {
    props: {
        'filters': Object,
        'counterUrl': String
    },
    data: function () {
        return {
            'count': 0
        }
    },
    methods: {
        updateCount: function (filters) {
            var vm = this;
            $.ajax({
                url: this.counterUrl,
                data: filters
            }).done(function (data) {
                vm.count = data.count;
            })
        }
    },
    watch: {
        'filters': {
            deep: true,
            immediate: true,
            handler: function (val) {
                this.updateCount(val);
            }
        }
    },

    template: `<h5>{{ count }} occurrence(s) matching selection</h5>`
});

// A single page in the occurrence table
Vue.component('occurrence-table-page', {
    props: {
        'occurrences': { // Only the subset for the page
            type: Array,
            default: function () {
                return []
            }
        }
    },
    computed: {
        preparedOccurrences: function () {
            // The occurrences, but formatted for display
            return this.occurrences.map(o => ({
                ...o, ...{
                    shortDatasetName: truncateString(o.datasetName, 20),
                    shortSpeciesName: o.speciesName.replace(/\([^\)\(]*\)/, ""), // Remove authorship (between parentheses)
                    recordType: o.isCatch ? "catch" : "observation",
                    occurrenceGbifUrl: "https://www.gbif.org/occurrence/" + o.gbifId,
                    datasetGbifUrl: "https://www.gbif.org/dataset/" + o.datasetKey,
                }
            }))
        }
    },
    template: `<tbody>
                 <tr v-for="occ in preparedOccurrences">
                    <th scope="row">
                        <a :href="occ.occurrenceGbifUrl" target="_blank">{{ occ.gbifId }}</a>
                    </th>
                    <td>{{ occ.lat }}</td>
                    <td>{{ occ.lon }}</td>
                    <td>{{ occ.date }}</td>
                    <td><i>{{ occ.shortSpeciesName }}</i></td>
                    <td>
                        <a :href="occ.datasetGbifUrl" target="_blank">{{ occ.shortDatasetName }}</a> 
                    </td>
                    <td>{{ occ.recordType }}</td>
                 </tr>
               </tbody>`
});

// The main table component (receive all occurrence, manage table options, header and pagination)
// TODO: make it load data according to pagination
Vue.component('dashboard-table', {
    props: {
        'filters': Object,
        'occurrencesJsonUrl': String
    },
    watch: {
        filters: {
            deep: true,
            immediate: true,
            handler: function () {
                this.currentPage = 1;
                this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
            },
        },
        currentPage: function () {
            this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
        },
        sortBy: function () {
            this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
        },
    },
    methods: {
        changeSort: function (newSort) {
            if (newSort != null) {
                this.sortBy = newSort;
            }
        },
        loadOccurrences: function (filters, orderBy, pageSize, pageNumber) {
            var params = filters;
            params.order = orderBy;
            params.limit = pageSize;
            params.page_number = pageNumber;

            var vm = this;
            $.ajax({
                url: this.occurrencesJsonUrl,
                data: params,
            }).done(function (data) {
                vm.occurrences = data.results;
                vm.firstPage = data.firstPage;
                vm.lastPage = data.lastPage - 1;
                vm.totalOccurrencesCount = data.totalResultsCount;
            })
        }
    },
    data: function () {
        return {
            currentPage: 1,
            firstPage: null,
            lastPage: null,
            pageSize: 20,
            totalOccurrencesCount: null,
            sortBy: 'id',
            occurrences: [],

            cols: [
                // sortId: must match django QS filter (null = non-sortable), label: displayed in header
                {'sortId': 'gbif_id', 'label': 'GBIF id',},
                {'sortId': null, 'label': 'Lat',},
                {'sortId': null, 'label': 'Lon',},
                {'sortId': '-date', 'label': 'Date',},
                {'sortId': 'species__name', 'label': 'Species',},
                {'sortId': 'source_dataset__name', 'label': 'Dataset',},
                {'sortId': null, 'label': 'Type',}
            ]
        }
    },
    computed: {
        hasPreviousPage: function () {
            return (this.currentPage > 1);
        },
        hasNextPage: function () {
            return (this.currentPage < this.lastPage);
        },
        isOnLastPage: function () {
            return (this.currentPage === this.lastPage);
        },
        isOnFirstPage: function () {
            return (this.currentPage === this.firstPage);
        }
    },
    template: `<div id="table-outer">
                    <table class="table table-striped table-sm">
                        <thead class="thead-dark">
                            <tr>
                                <th :class="{ 'text-primary': (sortBy == col.sortId) }" v-for="col in cols" scope="col">
                                    <span @click="changeSort(col.sortId)">{{ col.label }}</span>
                                </th>
                            </tr>
                        </thead>                 
                        <occurrence-table-page :occurrences="occurrences"></occurrence-table-page>
                    </table>
                    <p class="text-center">
                        <button type="button" :disabled="isOnFirstPage" class="btn btn-outline-primary btn-sm" @click="currentPage = firstPage">First</button> 
                        <button type="button" :disabled="!hasPreviousPage" class="btn btn-outline-primary btn-sm" @click="currentPage -= 1">Previous</button>
                        Page {{ currentPage }} / {{ lastPage }}
                        <button type="button" :disabled="!hasNextPage" class="btn btn-outline-primary btn-sm" @click="currentPage += 1">Next</button>
                        <button type="button" :disabled="isOnLastPage" class="btn btn-outline-primary btn-sm" @click="currentPage = lastPage">Last</button>
                    </p>
               </div>`
});

// The main map
Vue.component('dashboard-map', {
    props: {
        'minMaxUrl': String,
        'tileServerUrlTemplateOccurrences': String,
        'tileServerUrlTemplateOccurrencesForWater': String,
        'mapDataType': String, // occurrences | occurrencesForWater. Will impact the tile server url to use + display style

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'filters': Object, // For filtering occurrence data

        'dataLayerOpacity': Number,

        'overlayServerUrl': String,
        'overlayId': null,

        'showBiodiversityRichness': Boolean,
        'selectedYearsRichness': Array,
        'selectedGroupsRichness': Array,
        'tileServerUrlTemplateRichness': String,
    },
    data: function () {
        return {
            map: null,
            vectorSource: new ol.source.Vector(),
            areasOverlayCollection: new ol.Collection(),
            HexMinOccCount: 1,
            HexMaxOccCount: 1,

            occurrencesVectorTilesLayer: null,
            occurrencesForWaterVectorTilesLayer: null,
            biodiversityVectorTilesLayer: null,

            // TODO: make this dynamic
            /*minR: 0, // Water map: minimum rat score per square in the whole data set (! depends on filters)
            maxR: 10, // Water map: maximum rat score per square in the whole data set (! depends on filters)
            minW: 0, // Water map: minimum water score per square in the whole data set
            maxW: 3500,  // Water map: maximum water score per square in the whole data set

             */

            maxRatsPerKmWaterway: 100, // Water map: maximum rats per km waterway, for the color scale
        }
    },
    watch: {
        mapDataType: {
            handler: function (newVal) {
                this.setRatsTilesLayerVisbilility(newVal);
            }
        },
        showBiodiversityRichness: {
            handler: function (newVal) {
                this.setBiodiversityTilesLayerVisibility();
            }
        },
        selectedYearsRichness: {
            //immediate: true,
            handler: function (newVal) {
                this.replaceVectorTilesBiodiversityLayer();
            }
        },
        selectedGroupsRichness: {
            //immediate: true,
            handler: function (newVal) {
                this.replaceVectorTilesBiodiversityLayer();
            }
        },
        overlayId: {
            immediate: true,
            handler: function (overlayId) {
                this.refreshAreas();
            }
        },
        dataLayerOpacity: {
            handler: function (val) {
                if (this.occurrencesVectorTilesLayer) {
                    this.restyleOccurrencesVectorTilesLayer();
                }
                if (this.occurrencesForWaterVectorTilesLayer) {
                    this.restyleOccurrencesForWaterVectorTilesLayer();
                }
            }
        },
        HexMinOccCount: {
            handler: function (val) {
                this.restyleOccurrencesVectorTilesLayer();
            },
        },
        HexMaxOccCount: {
            handler: function (val) {
                this.restyleOccurrencesVectorTilesLayer();
            },
        },
        filters: {
            deep: true,
            handler: function (val) {
                this.loadOccMinMax(this.initialZoom, this.filters);
                this.replaceVectorTilesRatsLayers()
            },
        }

    },
    computed: {
        colorScaleOccurrences: function () {
            return d3.scaleSequentialLog(d3.interpolateBlues)
                .domain([this.HexMinOccCount, this.HexMaxOccCount])
        },
        colorScaleOccurrencesForWater: function () {
            return d3.scaleSequential(d3.interpolateCool)
                .domain([0, this.maxRatsPerKmWaterway])
        },

        ratScaleOccurrencesForWater: function () {
            return d3.scaleLinear().domain([this.minR, this.maxR]).clamp(true);
        },
        waterScaleOccurrencesForWater: function () {
            return d3.scaleLinear().domain([this.minW, this.maxW]).clamp(true);
        },
        colorScaleBiodiversity: function () {
            return d3.scaleSequentialLog(d3.interpolateGreens)
                .domain([1, 50])
        },
        biodiversityTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {
                const numberOfSpecies = feature.properties_.species_count;

                let textValue = numberOfSpecies.toFixed(2);
                const fillColor = vm.colorScaleBiodiversity(numberOfSpecies);

                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'black',
                        width: 1,
                    }),
                    fill: new ol.style.Fill({
                        color: fillColor,
                    }),
                    text: new ol.style.Text({
                        text: textValue,
                        fill: new ol.style.Fill({color: vm.legibleColor(fillColor)})
                    })
                })
            }
        },
        occurrencesForWaterTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {

                const r = feature.properties_.rats_score;
                const w = feature.properties_.water_score;

                const ratsPerKmWaterway = w === 0 ? 0 : r / (w / 1000);

                const fillColorRgbString = vm.colorScaleOccurrencesForWater(ratsPerKmWaterway);
                const fillColor = d3.color(fillColorRgbString);
                const textColor = vm.legibleColor(fillColorRgbString);

                const textValue = ratsPerKmWaterway.toFixed(2);

                return new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: vm.addOpacityToColor(fillColor)
                    }),
                    text: new ol.style.Text({
                        text: textValue,
                        fill: new ol.style.Fill({color: vm.addOpacityToColor(textColor)})
                    })
                })
            }

        },
        occurrencesVectorTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {
                const fillColorRgbString = vm.colorScaleOccurrences(feature.properties_.count);
                const fillColor = d3.color(fillColorRgbString);
                const strokeColor = d3.color('grey')
                const textColor = vm.legibleColor(fillColorRgbString);

                const textValue = feature.properties_.count.toString();

                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: vm.addOpacityToColor(strokeColor),
                        width: 1,
                    }),
                    fill: new ol.style.Fill({
                        color: vm.addOpacityToColor(fillColor),
                    }),
                    text: new ol.style.Text({
                        text: textValue,
                        fill: new ol.style.Fill({color: vm.addOpacityToColor(textColor)})
                    })
                })
            }
        }
    },
    methods: {
        setRatsTilesLayerVisbilility: function (selectedDataType) {
            if (selectedDataType === 'occurrences') {
                this.occurrencesVectorTilesLayer.setVisible(true);
                this.occurrencesForWaterVectorTilesLayer.setVisible(false);
            } else if (selectedDataType === 'occurrencesForWater') {
                this.occurrencesForWaterVectorTilesLayer.setVisible(true);
                this.occurrencesVectorTilesLayer.setVisible(false);
            }
        },
        setBiodiversityTilesLayerVisibility: function () {
            if (this.showBiodiversityRichness) {
                this.biodiversityVectorTilesLayer.setVisible(true);
            } else {
                this.biodiversityVectorTilesLayer.setVisible(false);
            }
        },
        restyleOccurrencesVectorTilesLayer: function () {
            if (this.occurrencesVectorTilesLayer) {
                this.occurrencesVectorTilesLayer.setStyle(this.occurrencesVectorTilesLayerStyleFunction)
            }
        },
        restyleOccurrencesForWaterVectorTilesLayer: function () {
            if (this.occurrencesForWaterVectorTilesLayer) {
                this.occurrencesForWaterVectorTilesLayer.setStyle(this.occurrencesForWaterTilesLayerStyleFunction)
            }
        },
        replaceVectorTilesRatsLayers: function () {
            this.map.removeLayer(this.occurrencesVectorTilesLayer);
            this.map.removeLayer(this.occurrencesForWaterVectorTilesLayer);

            this.loadOccMinMax(this.initialZoom, this.filters);
            this.occurrencesVectorTilesLayer = this.createVectorTilesRatsLayer(this.tileServerUrlTemplateOccurrences, this.occurrencesVectorTilesLayerStyleFunction, 2);
            this.map.addLayer(this.occurrencesVectorTilesLayer);
            this.occurrencesForWaterVectorTilesLayer = this.createVectorTilesRatsLayer(this.tileServerUrlTemplateOccurrencesForWater, this.occurrencesForWaterTilesLayerStyleFunction, 2);
            this.map.addLayer(this.occurrencesForWaterVectorTilesLayer);

            this.setRatsTilesLayerVisbilility(this.mapDataType);
        },

        replaceVectorTilesBiodiversityLayer: function () {
            this.map.removeLayer(this.biodiversityVectorTilesLayer);
            this.biodiversityVectorTilesLayer = this.createVectorTilesBiodiversityLayer(this.tileServerUrlTemplateRichness, this.biodiversityTilesLayerStyleFunction, 2);
            //console.log("passe", this.biodiversityVectorTilesLayer);
            this.map.addLayer(this.biodiversityVectorTilesLayer);

            this.setBiodiversityTilesLayerVisibility();
        },

        legibleColor: function (color) {
            // TODO: change input parameter type to d3.color (for consistency)
            // in: rgb string
            // out: d3.color object
            return d3.hsl(color).l > 0.5 ? d3.color("black") : d3.color("white");
        },

        addOpacityToColor: function (color) {
            // in: d3.color object
            // out: hex8 string
            color.opacity = this.dataLayerOpacity;
            return color.formatHex8();
        },

        createVectorTilesBiodiversityLayer: function (tileServerUrlTemplate, styleFunction, zIndex) {
            let vm = this;

            const yearsParams = this.selectedYearsRichness.map(function (el) {
                return 'years[]=' + el;
            }).join('&');

            const speciesGroupParams = this.selectedGroupsRichness.map(function (el) {
                return 'speciesGroups[]=' + el;
            }).join('&');

            let l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: tileServerUrlTemplate + "?" + yearsParams + "&" + speciesGroupParams,
                }),
                style: styleFunction,
                zIndex: zIndex,
            });

            return l;
        },

        createVectorTilesRatsLayer: function (tileServerUrlTemplate, styleFunction, zIndex) {
            var vm = this;
            var l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: tileServerUrlTemplate + '?' + $.param(vm.filters),
                }),
                style: styleFunction,
                zIndex: zIndex
            });

            return l;
        },

        loadOccMinMax: function (zoomLevel, filters) {
            var vm = this

            var params = filters;
            params.zoom = zoomLevel;

            $.ajax({
                url: this.minMaxUrl,
                data: params
            }).done(function (data) {
                vm.HexMinOccCount = data.min;
                vm.HexMaxOccCount = data.max;
            })

        },
        createBaseMap: function () {
            const baseLayer = new ol.layer.Tile({
                source: new ol.source.OSM({url: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}),
                zIndex: 1
            })

            const areasGroup = new ol.layer.Group({
                layers: this.areasOverlayCollection,
            })

            return new ol.Map({
                layers: [
                    baseLayer,
                    areasGroup
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        },
        refreshAreas: function () {
            let vm = this;
            this.areasOverlayCollection.clear();
            if (this.overlayId !== null) {
                $.ajax(this.overlayServerUrl.replace('{id}', this.overlayId.toString()))
                    .done(function (data) {
                        const vectorSource = new ol.source.Vector({
                            features: new ol.format.GeoJSON().readFeatures(data, {
                                dataProjection: "EPSG:4326",
                                featureProjection: "EPSG:3857",
                            }),
                        });

                        const vectorLayer = new ol.layer.Vector({
                            source: vectorSource,
                            style: new ol.style.Style({
                                stroke: new ol.style.Stroke({
                                    color: "red",
                                    width: 3,
                                }),
                            }),
                            zIndex: 3
                        });

                        vm.areasOverlayCollection.push(vectorLayer);
                    })
            }

        }
    },
    mounted() {
        this.map = this.createBaseMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.replaceVectorTilesRatsLayers();
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 500px; width: 100%;"></div>'
})