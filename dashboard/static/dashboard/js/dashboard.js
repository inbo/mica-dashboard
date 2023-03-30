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
        hidden: {
            type: Boolean,
            default: false,
        }
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
        xScaleDomain() {
            return this.barData.map(e => e.yearMonth);
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
                this.barData,
                d => {
                    return d.count;
                }
            );
            return maxVal ? maxVal : 0;
        },
        displayClasses() {
            return {
                'd-none': this.hidden,
                'd-block': !this.hidden,
                'mx-auto': true,
            };
        }
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
            :class="displayClasses"
            :width="svgStyle.width"
            :height="svgStyle.height"
        >
        <g :transform="'translate(' + svgStyle.margin.left.toString() + ', ' +  svgStyle.margin.top.toString() + ')'">
            <rect
                v-for="(barDataEntry, index) in barData"
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
            loading: false,
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
        buildEmptyHistogramArray: function (rangeStart, rangeEnd) {
            let data = [];
            const yearsRange = range(rangeStart.year, rangeEnd.year + 1);

            yearsRange.forEach((currentYear, yearIndex) => {
                const startMonth = yearIndex === 0 ? rangeStart.month : 1;
                const endMonth =
                    yearIndex === yearsRange.length - 1 ? rangeEnd.month : 12;

                for (let currentMonth = startMonth; currentMonth <= endMonth; currentMonth++) {
                    let d = {
                        year: currentYear,
                        month: currentMonth,
                        count: 0,
                    }
                    data.push(d);
                }
            });
            return data;
        },
        loadHistogramData: function (filters) {
            let vm = this;
            vm.loading = true;
            // The histogram has to drop the date filtering parameters
            $.ajax({
                url: this.monthlyCountersUrl,
                data: filters
            }).done(function (data) {
                if (data.length === 0) {
                    vm.histogramDataFromServer = [];
                } else {
                    // Build an empty range (padding)
                    let emptyHistogramData = vm.buildEmptyHistogramArray(
                        data[0],
                        data[data.length - 1]
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
                vm.loading = false;
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
            <h3 v-if="loading">Loading...</h3>
            <bar-chart :hidden="loading" :bar-data="preparedHistogramData" />
        </div>`,
});

Vue.component('dashboard-occurrence-counter', {
    props: {
        'filters': Object,
        'counterUrl': String
    },
    data: function () {
        return {
            'count': 0,
            'loading': false
        }
    },
    computed: {
        formattedCount: function () {
            return new Intl.NumberFormat().format(this.count);
        },
        occurrencesPluralized: function () {
            return this.count === 1 ? 'occurrence' : 'occurrences';
        }
    },
    methods: {
        updateCount: function (filters) {
            var vm = this;
            vm.loading = true;
            $.ajax({
                url: this.counterUrl,
                data: filters
            }).done(function (data) {
                vm.count = data.count;
                vm.loading = false;
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

    template: `<h4>
                    <span class="badge bg-warning" style="float: right"> 
                        <span v-if="loading">Loading...</span>
                        <span v-else>{{ formattedCount }} {{ occurrencesPluralized }} matching selection</span>
                    </span>
               </h4>`
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
            let params = Object.assign({}, filters);
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


Vue.component('color-legend', {
    props: ['colorScale', 'opacity', 'label'],
    data: function () {
        return {
            styleDiv: {
                height: 20,
                width: 1200,
                margin: {top: 0, right: 0, bottom: 0, left: 20}
            }
        }
    },
    directives: {
        axis(el, binding) {
            const scaleFunction = binding.value.scale;
            const legendAxis = d3
                .axisBottom(scaleFunction)
            legendAxis(d3.select(el));
        }
    },
    mounted: function () {
        this.renderColorRamp(this.opacity);
    },
    watch: {
        colorScale: {
            handler: function (newOpacity) {
                this.clearCanvas();
                this.renderColorRamp(newOpacity);
            },
        },
        opacity: {
            handler: function (newOpacity) {
                this.clearCanvas();
                this.renderColorRamp(newOpacity);
            },
        }
    },
    methods: {
        clearCanvas: function () {
            const ctx = this.ctx;
            if (ctx != null) {
                ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            }
        },
        addOpacityToColor: function (colorStr, opacity) {
            const colorObj = d3.color(colorStr);

            if (colorObj != null) {
                colorObj.opacity = opacity;
                return colorObj + "";
            } else {
                throw "colorStr is not a correct CSS color specifier";
            }

        },
        renderColorRamp: function (opacity) {
            const ctx = this.ctx;
            if (ctx != null) {
                d3.range(this.canvasWidth).forEach(i => {
                    ctx.fillStyle = this.addOpacityToColor(
                        this.colorScale(this.legendScale.invert(i)),
                        opacity
                    );
                    ctx.fillRect(i, 0, 1, this.canvasHeight);
                });
            } else {
                throw "No canvas context found";
            }
        }
    },
    computed: {
        ctx: function () {
            return this.$refs.canvas.getContext("2d");
        },
        legendScale: function () {
            return d3
                .scaleLinear()
                .range([
                    1,
                    this.canvasWidth
                ])
                .domain(this.colorScale.domain());
        },
        styleCanvasPrepared: function () {
            return {
                border: "1px solid #000",
                display: "block",
                top: this.styleDiv.margin.top + "px",
                left: this.styleDiv.margin.left + "px"
            };
        },
        canvasWidth: function () {
            return (
                this.styleDiv.width -
                this.styleDiv.margin.left -
                this.styleDiv.margin.right
            );
        },
        canvasHeight: function () {
            return (
                this.styleDiv.height -
                this.styleDiv.margin.top -
                this.styleDiv.margin.bottom
            );
        }
    },
    template: `<div id="color-legend">
                    <span class="small">{{ label }}</span>
                    <canvas ref="canvas" :height="canvasHeight" :width="canvasWidth" :style="styleCanvasPrepared" />
                    <svg :height="20" :width="styleDiv.width">
                        <g
                            v-axis="{'scale': legendScale }"
                            class="axis"                            
                        />
                    </svg>
               </div>`
});

// The main map
Vue.component('dashboard-map', {
    props: {
        'minMaxUrl': String,
        'tileServerUrlTemplateOccurrencesSimple': String,
        'tileServerUrlTemplateOccurrencesAggregated': String,
        'tileServerUrlTemplateOccurrencesForWater': String,
        'mapDataType': String, // occurrences | occurrencesForWater. Will impact the tile server url to use + display style. occurrences are shown aggregated or not, depending on the zoom level
        'mapDataTypeText': String,

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

            aggregatedOccurrencesVectorTilesLayer: null,
            simpleOccurrencesVectorTilesLayer: null,
            occurrencesForWaterVectorTilesLayer: null,
            biodiversityVectorTilesLayer: null,

            maxRatsPerKmWaterway: 300, // Water map: maximum rats per km waterway, for the color scale. Scale is clamped, so higher value will be displayed as the max
            layerSwitchZoomLevel: 13, // Zoom level at which the aggregated occurrences layer is shown instead of the simple occurrences layer
            popup: new ol.Overlay({}),
            popover: null,
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
            handler: function (newVal) {
                this.replaceVectorTilesBiodiversityLayer();
            }
        },
        selectedGroupsRichness: {
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
                if (this.aggregatedOccurrencesVectorTilesLayer) {
                    this.restyleAggregatedOccurrencesVectorTilesLayer();
                }
                if (this.simpleOccurrencesVectorTilesLayer) {
                    this.restyleSimpleOccurrencesVectorTilesLayer();
                }
                if (this.occurrencesForWaterVectorTilesLayer) {
                    this.restyleOccurrencesForWaterVectorTilesLayer();
                }
            }
        },
        HexMinOccCount: {
            handler: function (val) {
                this.restyleAggregatedOccurrencesVectorTilesLayer();
            },
        },
        HexMaxOccCount: {
            handler: function (val) {
                this.restyleAggregatedOccurrencesVectorTilesLayer();
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
                .domain([1, this.maxRatsPerKmWaterway])
                .clamp(true);
        },

        colorScaleSelectedDataLayer: function () {
            if (this.mapDataType === 'occurrences') {
                return this.colorScaleOccurrences;
            } else if (this.mapDataType === 'occurrencesForWater') {
                return this.colorScaleOccurrencesForWater;
            }
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
        simpleOccurrencesVectorTilesLayerStyleFunction: function () {
            let vm = this
            return function (feature) {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 7,
                        fill: new ol.style.Fill({color: vm.addOpacityToColor(d3.color("#242d66"))})
                    })
                });
            }
        },
        aggregatedOccurrencesVectorTilesLayerStyleFunction: function () {
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
                this.aggregatedOccurrencesVectorTilesLayer.setVisible(true);
                this.simpleOccurrencesVectorTilesLayer.setVisible(true);
                this.occurrencesForWaterVectorTilesLayer.setVisible(false);
            } else if (selectedDataType === 'occurrencesForWater') {
                this.occurrencesForWaterVectorTilesLayer.setVisible(true);
                this.aggregatedOccurrencesVectorTilesLayer.setVisible(false);
                this.simpleOccurrencesVectorTilesLayer.setVisible(false);
            }
        },
        setBiodiversityTilesLayerVisibility: function () {
            if (this.showBiodiversityRichness) {
                this.biodiversityVectorTilesLayer.setVisible(true);
            } else {
                this.biodiversityVectorTilesLayer.setVisible(false);
            }
        },
        restyleSimpleOccurrencesVectorTilesLayer: function () {
            if (this.simpleOccurrencesVectorTilesLayer) {
                this.simpleOccurrencesVectorTilesLayer.setStyle(this.simpleOccurrencesVectorTilesLayerStyleFunction)
            }
        },
        restyleAggregatedOccurrencesVectorTilesLayer: function () {
            if (this.aggregatedOccurrencesVectorTilesLayer) {
                this.aggregatedOccurrencesVectorTilesLayer.setStyle(this.aggregatedOccurrencesVectorTilesLayerStyleFunction)
            }
        },
        restyleOccurrencesForWaterVectorTilesLayer: function () {
            if (this.occurrencesForWaterVectorTilesLayer) {
                this.occurrencesForWaterVectorTilesLayer.setStyle(this.occurrencesForWaterTilesLayerStyleFunction)
            }
        },
        replaceVectorTilesRatsLayers: function () {
            this.map.removeLayer(this.simpleOccurrencesVectorTilesLayer);
            this.map.removeLayer(this.aggregatedOccurrencesVectorTilesLayer);
            this.map.removeLayer(this.occurrencesForWaterVectorTilesLayer);

            this.simpleOccurrencesVectorTilesLayer = this.createVectorTilesRatsLayer(
                this.tileServerUrlTemplateOccurrencesSimple,
                this.simpleOccurrencesVectorTilesLayerStyleFunction,
                4,
                this.layerSwitchZoomLevel,
                24); // minZoom doesn't work without maxZoom?
            this.map.addLayer(this.simpleOccurrencesVectorTilesLayer);
            this.loadOccMinMax(this.initialZoom, this.filters);

            this.aggregatedOccurrencesVectorTilesLayer = this.createVectorTilesRatsLayer(
                this.tileServerUrlTemplateOccurrencesAggregated,
                this.aggregatedOccurrencesVectorTilesLayerStyleFunction,
                2,
                null,
                this.layerSwitchZoomLevel);
            this.map.addLayer(this.aggregatedOccurrencesVectorTilesLayer);

            this.occurrencesForWaterVectorTilesLayer = this.createVectorTilesRatsLayer(this.tileServerUrlTemplateOccurrencesForWater, this.occurrencesForWaterTilesLayerStyleFunction, 4);
            this.map.addLayer(this.occurrencesForWaterVectorTilesLayer);

            this.setRatsTilesLayerVisbilility(this.mapDataType);
        },

        replaceVectorTilesBiodiversityLayer: function () {
            this.map.removeLayer(this.biodiversityVectorTilesLayer);
            this.biodiversityVectorTilesLayer = this.createVectorTilesBiodiversityLayer(this.tileServerUrlTemplateRichness, this.biodiversityTilesLayerStyleFunction, 3);
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

        createVectorTilesRatsLayer: function (tileServerUrlTemplate, styleFunction, zIndex, minZom = null, maxZoom = null) {
            let vm = this;
            const l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: tileServerUrlTemplate + '?' + $.param(vm.filters),
                }),
                style: styleFunction,
                zIndex: zIndex,
            });

            if (minZom != null) {
                l.setMinZoom(minZom);
            }
            if (maxZoom != null) {
                l.setMaxZoom(maxZoom);
            }

            return l;
        },

        loadOccMinMax: function (zoomLevel, filters) {
            var vm = this

            let params = Object.assign({}, filters);
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
                                    color: "#242d66",
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

        // Prepare popup
        this.popup.setElement(this.$refs["popup-root"]);
        this.map.addOverlay(this.popup);

        this.map.on('click', evt => {
            // Hide previously opened
            if (this.popover !== null) {
                this.popover.hide();
            }

            if (this.map && this.map.getView().getZoom() >= this.layerSwitchZoomLevel) {
                const features = this.map.getFeaturesAtPixel(evt.pixel);

                const clickedFeaturesData = features.map((f) => {
                    const properties = f.getProperties();
                    return {
                        gbifId: properties["gbif_id"],
                        url: "https://www.gbif.org/occurrence/" + properties["gbif_id"],
                        individualCount: properties["individual_count"],
                        datasetName: properties["dataset_name"],
                    };
                });

                const clickedFeaturesHtmlList = clickedFeaturesData.map((f) => {
                    return '<li><a href="' + f.url + '" target="_blank">' + f.gbifId + '</a> (<b>individual count:</b></b> ' + f.individualCount + ' ' + '<b>dataset:</b> ' + f.datasetName + ')</li>';
                });


                if (clickedFeaturesData.length > 0) {
                    this.popup.setPosition(evt.coordinate);
                    this.popover = new bootstrap.Popover(this.popup.getElement(), {
                        html: true,
                        content:
                            "<ul class='list-unstyled'>" +
                            clickedFeaturesHtmlList.join("") +
                            "</ul>",
                    });
                    this.popover.show();
                }
            }
        });
    },
    template: `
        <div>
            <div id="map" class="map" ref="map-root" style="height: 500px; width: 100%; margin-bottom: 10px"></div>
            <color-legend :color-scale="colorScaleSelectedDataLayer" :opacity="dataLayerOpacity" :label="mapDataTypeText"></color-legend>
            <color-legend v-show="showBiodiversityRichness" :color-scale="colorScaleBiodiversity" :opacity="1" label="Biodiversity richness in MICA areas: "></color-legend>
            <div ref="popup-root" title="Observations at this location"></div>
        </div> 
    `
})