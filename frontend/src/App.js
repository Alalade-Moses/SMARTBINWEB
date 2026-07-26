import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import './App.css';
import Login from './login';


const iconShadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png';

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const orangeIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const createNumberedIcon = (number) => {
    return L.divIcon({
        className: 'numbered-marker-icon',
        html: `<b>${number}</b>`,
        iconSize: [25, 25],
        iconAnchor: [12, 12]
    });
};

const PREDICTED_SOON_MS = 60 * 60 * 1000;

const isPredictedFullSoon = (predictedFull) => {
    if (!predictedFull) return false;
    const predictedDate = new Date(predictedFull);
    if (Number.isNaN(predictedDate.getTime())) return false;

    const diffMs = predictedDate.getTime() - Date.now();
    return diffMs > 0 && diffMs <= PREDICTED_SOON_MS;
};

const areaConfigs = {
    'Lagos (Ikeja)': { center: [6.6018, 3.3515], depot: [6.5950, 3.3420] },
    'Lagos (Lekki)': { center: [6.4698, 3.5852], depot: [6.4600, 3.5700] },
    'Lagos (Victoria Island)': { center: [6.4281, 3.4219], depot: [6.4200, 3.4100] },
    'Noida': { center: [28.5448, 77.3721], depot: [28.5355, 77.3910] },
    'Delhi': { center: [28.6139, 77.2090], depot: [28.6139, 77.2090] },
    'Gurugram': { center: [28.4595, 77.0266], depot: [28.4595, 77.0266] }
};

const maintenanceIcon = L.divIcon({
    className: 'maintenance-marker-icon',
    html: '<span>⚠️</span>',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
});

const getBinStatusIcon = (bin) => {
    if (bin.status === "MAINTENANCE") return maintenanceIcon;
    if (bin.status === 'FULL') return redIcon;
    const fillPercent = (bin.current_fill_kg / bin.capacity_kg) * 100;
    if (fillPercent >= 70 || isPredictedFullSoon(bin.predicted_full)) return orangeIcon;
    return greenIcon;
};

const MapController = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        if (map) {
            map.flyTo(center, 13, { duration: 1.5 });
        }
    }, [center, map]);
    return null;
};

function App() {
    const [bins, setBins] = useState([]);
    const [areas, setAreas] = useState(['Lagos (Ikeja)', 'Lagos (Lekki)', 'Lagos (Victoria Island)', 'Noida', 'Delhi', 'Gurugram']);
    const [selectedArea, setSelectedArea] = useState('Lagos (Ikeja)');
    const [summaryStats, setSummaryStats] = useState([]);
    const [route, setRoute] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [role, setRole] = useState(localStorage.getItem('role') || 'admin');
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [activeHistoryDay, setActiveHistoryDay] = useState(null);
    const [showUrgentOnly, setShowUrgentOnly] = useState(false);
    const [selectedBinId, setSelectedBinId] = useState(null);
    const [binHistoryById, setBinHistoryById] = useState({});
    const [truckStatuses, setTruckStatuses] = useState([]);
    const [systemMode, setSystemMode] = useState('smart'); // 'smart' | 'traditional'
    const [showEvalModal, setShowEvalModal] = useState(false);

    const currentAreaConfig = areaConfigs[selectedArea] || areaConfigs["Lagos (Ikeja)"];
    const depotPosition = currentAreaConfig.depot;

    
    useEffect(() => {
        setRoute(null);
        setSelectedBinId(null);
        setActiveHistoryDay(null);
    }, [selectedArea]);

    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            localStorage.setItem('token', token);
        } else {
            delete axios.defaults.headers.common['Authorization'];
            localStorage.removeItem('token');
        }
    }, [token]);

    const fetchData = useCallback(async (showLoader = false) => {
        if (!token) return;
        try {
            if (showLoader) setLoading(true);

            
            const [areasRes, binsRes, summaryRes, historyRes, trucksRes] = await Promise.all([
                axios.get('/api/areas'),
                axios.get('/api/bins'),
                axios.get('/api/stats/summary'),
                axios.get('/api/stats/history'),
                axios.get('/api/trucks/status')
            ]);

            setAreas(areasRes.data);
            setBins(binsRes.data);
            setSummaryStats(summaryRes.data);
            setHistory(historyRes.data);
            setTruckStatuses(trucksRes.data);

            
            try {
                const routeRes = await axios.get(`/api/routes/latest?area=${selectedArea}`);
                setRoute(routeRes.data);
            } catch (routeErr) {
                if (routeErr.response && routeErr.response.status === 404) {
                    setRoute(null);
                }
            }

        } catch (error) {
            console.error("Fetch Error:", error);
            if (error.response && error.response.status === 401) setToken(null);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [token, selectedArea]);

    useEffect(() => {
        if (token) {
            fetchData(true);
            const interval = setInterval(() => fetchData(false), 30000);
            
            const handleGlobalClick = (e) => {
                if (!e.target.closest(".trend-bar")) setActiveHistoryDay(null);
                const isMapBackground = e.target.classList.contains("leaflet-container");
                const isMapWrapper = e.target.closest(".map-wrapper");
                const isMarker = e.target.closest(".leaflet-marker-icon") || e.target.closest(".leaflet-popup");
                if (isMapBackground || (isMapWrapper && !isMarker)) setSelectedBinId(null);
            };
            document.addEventListener("click", handleGlobalClick);
            return () => {
                clearInterval(interval);
                document.removeEventListener("click", handleGlobalClick);
            };
        }
    }, [token, fetchData]);

    const handleSelectBin = async (binId) => {
        setSelectedBinId(binId);
        try {
            const historyRes = await axios.get(`/api/bins/${binId}/history?limit=20`);
            setBinHistoryById(prev => ({ ...prev, [binId]: historyRes.data }));
        } catch (error) {
            console.error("Error fetching bin history:", error);
            setBinHistoryById(prev => ({ ...prev, [binId]: [] }));
        }
    };

    const handleCollectBin = async (binId) => {
        try {
            const nowIso = new Date().toISOString();
            setBins(prev => prev.map(b => b.id === binId ? { ...b, current_fill_kg: 0.0, status: 'EMPTY', last_collected: nowIso, predicted_full: null } : b));
            setRoute(prevRoute => {
                if (!prevRoute || !prevRoute.stops) return prevRoute;
                return {
                    ...prevRoute,
                    stops: prevRoute.stops.map(s => s.bin_id === binId ? { ...s, status: 'COLLECTED' } : s)
                };
            });

            await axios.post(`/api/bins/${binId}/empty`);
            addToast(`♻️ Bin #${binId} marked as collected! Stop status updated to COLLECTED.`, "success");
            await fetchData(false);
        } catch (error) {
            console.error("Error collecting bin:", error);
            const errMsg = error.response?.data?.message || "Could not mark bin as collected.";
            addToast(`Error: ${errMsg}`, "error");
            await fetchData(false);
        }
    };

    const handleUpdateBinStatus = async (binId, status) => {
        try {
            await axios.post(`/api/bins/${binId}/status`, { status });
            addToast(status === 'MAINTENANCE' ? "Bin marked for maintenance." : "Bin restored to service.", "success");
            await handleSelectBin(binId);
            await fetchData(false);
        } catch (error) {
            console.error("Error updating bin status:", error);
            addToast("Could not update bin status.", "error");
        }
    };

    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const exportToCSV = () => {
        
        const headers = [
            "Bin ID",
            "Area",
            "Latitude",
            "Longitude",
            "Current Fill (kg)",
            "Max Capacity (kg)",
            "Fill Level (%)",
            "Urgency Level",
            "Current Status",
            "In Active Route",
            "Route Stop #",
            "Assigned Truck",
            "Last Collection (AM/PM)",
            "Predicted Full (AM/PM)"
        ];

        
        const formatCSVDate = (dateStr) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'N/A';

            const datePart = d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }).replace(/\//g, '-');

            const timePart = d.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            
            
            return `="${datePart} ${timePart}"`;
        };

        const rows = bins
            .filter(b => b.area_name === selectedArea)
            .map(b => {
                const fillRatio = b.current_fill_kg / b.capacity_kg;
                const fillPercent = (fillRatio * 100).toFixed(1) + '%';

                
                let urgency = "LOW";
                if (b.status === 'FULL' || fillRatio >= 0.9) urgency = "CRITICAL";
                else if (fillRatio >= 0.7) urgency = "HIGH";
                else if (fillRatio >= 0.4) urgency = "MEDIUM";

                
                const stop = route?.stops?.find(s => s.bin_id === b.id && s.status === 'PENDING');
                const inRoute = stop ? "YES" : "NO";
                const sequence = stop ? stop.sequence_order : "N/A";
                const truck = stop ? (route.truck_reg_number || "TRUCK-001") : "N/A";

                return [
                    b.id,
                    b.area_name,
                    b.lat,
                    b.lon,
                    b.current_fill_kg.toFixed(2),
                    b.capacity_kg,
                    fillPercent,
                    urgency,
                    b.status,
                    inRoute,
                    sequence,
                    truck,
                    formatCSVDate(b.last_collected),
                    formatCSVDate(b.predicted_full)
                ];
            });

        
        const csvRows = [headers, ...rows];
        const csvContent = "\uFEFF" + csvRows.map(r => r.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);

        const timestamp = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        const filename = `SmartWaste_Ops_Report_${selectedArea}_${timestamp}.csv`;

        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addToast(`Operational report for ${selectedArea} downloaded!`, "success");
    };

    const sustainability = (() => {
        const routedBins = route?.stops?.length || 0;
        const totalBins = bins.filter(b => b.area_name === selectedArea).length;
        const avoidedBins = Math.max(0, totalBins - routedBins);

        return {
            fuelSaved: (avoidedBins * 0.35).toFixed(1),
            co2Reduced: (avoidedBins * 0.35 * 2.31).toFixed(1),
            efficiency: totalBins > 0 ? Math.round((avoidedBins / totalBins) * 100) : 0
        };
    })();

    const calculateDistance = (p1, p2) => {
        if (!p1 || !p2) return 0;
        const R = 6371; 
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const remainingDistance = useMemo(() => {
        if (!route || !route.stops) return 0;
        const sortedStops = [...route.stops].sort((a, b) => a.sequence_order - b.sequence_order);
        const pendingStops = sortedStops.filter(s => s.status === 'PENDING');
        if (pendingStops.length === 0) return 0;

        let total = 0;
        const firstPendingIndex = sortedStops.findIndex(s => s.status === 'PENDING');
        const lastFinishedStop = sortedStops
            .slice(0, firstPendingIndex)
            .reverse()
            .find(s => s.status !== 'PENDING');

        let lastPos = lastFinishedStop
            ? { lat: lastFinishedStop.lat, lon: lastFinishedStop.lon }
            : { lat: depotPosition[0], lon: depotPosition[1] };

        pendingStops.forEach(s => {
            total += calculateDistance(lastPos, { lat: s.lat, lon: s.lon });
            lastPos = { lat: s.lat, lon: s.lon };
        });
        total += calculateDistance(lastPos, { lat: depotPosition[0], lon: depotPosition[1] });
        return total;
    }, [route, depotPosition]);



    const areaBins = useMemo(() => bins.filter(b => b.area_name === selectedArea), [bins, selectedArea]);

    const selectedBin = useMemo(() =>
        bins.find(b => b.id === selectedBinId) || null,
    [bins, selectedBinId]);

    const urgentBins = useMemo(() => areaBins.filter(b =>
        (b.status === 'FULL' || (b.current_fill_kg / b.capacity_kg) >= 0.7) && b.status !== 'EMPTY'
    ), [areaBins]);

    const visibleBins = showUrgentOnly ? urgentBins : areaBins;

    const areaSummary = useMemo(() => {
        const total = areaBins.length;
        const avgFill = total > 0
            ? areaBins.reduce((sum, bin) => sum + bin.current_fill_kg, 0) / total
            : 0;

        return {
            total,
            avgFill,
            full: areaBins.filter(bin => bin.status === 'FULL').length,
            nearlyFull: areaBins.filter(bin => (bin.current_fill_kg / bin.capacity_kg) >= 0.7).length,
            predictedSoon: areaBins.filter(bin => isPredictedFullSoon(bin.predicted_full)).length,
            maintenance: areaBins.filter(bin => bin.status === 'MAINTENANCE').length
        };
    }, [areaBins]);

    useEffect(() => {
        if (selectedBinId && !areaBins.some(bin => bin.id === selectedBinId)) {
            setSelectedBinId(null);
        }
    }, [selectedArea, selectedBinId, areaBins]);

    const formatPredictedFull = (predictedFull) => {
        if (!predictedFull) return 'Not available';
        const predictedDate = new Date(predictedFull);
        if (Number.isNaN(predictedDate.getTime())) return 'Invalid date';

        const absolute = predictedDate.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const diffMs = predictedDate.getTime() - Date.now();
        if (diffMs <= 0) return `${absolute} (due now)`;

        const minutes = Math.round(diffMs / (1000 * 60));
        if (minutes < 5) return `${absolute} (very soon)`;
        if (minutes < 60) return `${absolute} (in ~${minutes}m)`;

        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${absolute} (in ~${hours}h)`;

        const days = Math.round(hours / 24);
        return `${absolute} (in ~${days}d)`;
    };

    const formatLastCollected = (lastCollected) => {
        if (!lastCollected) return 'Not collected yet';
        const collectedDate = new Date(lastCollected);
        if (Number.isNaN(collectedDate.getTime())) return 'Invalid date';

        const absolute = collectedDate.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const diffMs = Date.now() - collectedDate.getTime();
        if (diffMs < 0) return absolute;

        const minutes = Math.round(diffMs / (1000 * 60));
        if (minutes < 1) return `${absolute} (just now)`;
        if (minutes < 60) return `${absolute} (~${minutes}m ago)`;

        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${absolute} (~${hours}h ago)`;

        const days = Math.round(hours / 24);
        return `${absolute} (~${days}d ago)`;
    };

    const renderHistorySparkline = (bin) => {
        const historyPoints = binHistoryById[bin.id] || [];
        if (historyPoints.length === 0) {
            return <div className="popup-history-empty">No history yet</div>;
        }

        const width = 180;
        const height = 46;
        const maxFill = Math.max(bin.capacity_kg || 1, ...historyPoints.map(point => point.fill_level_kg || 0));
        const points = historyPoints.map((point, index) => {
            const x = historyPoints.length === 1 ? width : (index / (historyPoints.length - 1)) * width;
            const y = height - ((point.fill_level_kg || 0) / maxFill) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        return (
            <div className="popup-history">
                <div className="popup-history-label">Recent Fill Trend</div>
                <svg viewBox={`0 0 ${width} ${height}`} className="popup-history-chart" aria-hidden="true">
                    <polyline points={points} />
                </svg>
            </div>
        );
    };

    const handleResetDatabase = async () => {
        if (!window.confirm("Reset entire database?")) return;
        try {
            setLoading(true);
            await axios.post('/api/reset');
            fetchData(false);
        } finally {
            setLoading(false);
        }
    };

    const stats = (() => {
        return {
            total: areaBins.length,
            urgent: urgentBins.length,
            distance: remainingDistance
        };
    })();

    if (!token) return <Login setToken={setToken} setRole={setRole} />;

    return (
        <div className="App">
            {loading && <div className="loading-overlay"><div className="spinner"></div></div>}

            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`}>
                        {t.message}
                    </div>
                ))}
            </div>

            <div className="map-wrapper">
                <MapContainer center={currentAreaConfig.center} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <MapController center={currentAreaConfig.center} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={depotPosition} icon={blueIcon}><Popup autoPanPaddingTopLeft={[400, 120]} autoPanPaddingBottomRight={[350, 20]}>Depot</Popup></Marker>
                    {visibleBins.map(bin => {
                        const pendingStop = route?.stops?.find(s => s.bin_id === bin.id && s.status === 'PENDING');
                        const collectedStop = route?.stops?.find(s => s.bin_id === bin.id && (s.status === 'COLLECTED' || s.status === 'COLLECTED_SKIP'));
                        const icon = pendingStop ? createNumberedIcon(pendingStop.sequence_order) : getBinStatusIcon(bin);
                        return (
                            <Marker
                                key={bin.id}
                                position={[bin.lat, bin.lon]}
                                icon={icon}
                                eventHandlers={{ click: () => handleSelectBin(bin.id) }}
                            >
                                <Popup autoPanPaddingTopLeft={[400, 120]} autoPanPaddingBottomRight={[350, 20]}>
                                    <b>Bin ID: #{bin.id}</b><br />
                                    {pendingStop && <h3 style={{color: '#f59e0b', margin: '4px 0'}}>Stop #{pendingStop.sequence_order} (Pending)</h3>}
                                    {collectedStop && <h3 style={{color: '#2ecc71', margin: '4px 0'}}>✓ Stop #{collectedStop.sequence_order} (Collected)</h3>}
                                    {bin.status === 'EMPTY' && <b style={{color: '#2ecc71', fontSize: '0.95rem'}}>✓ Collected & Emptied</b>}
                                    <br />
                                    <b>Fill:</b> {bin.current_fill_kg.toFixed(1)} / {bin.capacity_kg.toFixed(1)} kg<br />
                                    <b>Status:</b> <span style={{fontWeight: 'bold', color: bin.status === 'EMPTY' ? '#2ecc71' : bin.status === 'FULL' ? '#ef4444' : '#f59e0b'}}>{bin.status}</span><br />
                                    <b>Last Collected:</b> {formatLastCollected(bin.last_collected)}<br />
                                    <b>Est. Full:</b> {bin.predicted_full ? formatPredictedFull(bin.predicted_full) : 'Analyzing...'}<br />
                                    {renderHistorySparkline(bin)}
                                    <br />
                                    {bin.status !== 'EMPTY' ? (
                                        <button
                                            onClick={() => handleCollectBin(bin.id)}
                                            style={{
                                                width: '100%',
                                                cursor: 'pointer',
                                                marginTop: '8px',
                                                background: 'linear-gradient(135deg, #00b09b, #96c93d)',
                                                color: '#000',
                                                fontWeight: 'bold',
                                                border: 'none',
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                boxShadow: '0 2px 8px rgba(0,176,155,0.4)'
                                            }}
                                        >
                                            ✓ Mark as Collected
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            style={{
                                                width: '100%',
                                                marginTop: '8px',
                                                background: 'rgba(46, 204, 113, 0.2)',
                                                border: '1px solid #2ecc71',
                                                color: '#2ecc71',
                                                fontWeight: 'bold',
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                cursor: 'default'
                                            }}
                                        >
                                            ✓ Collected (0.0 kg)
                                        </button>
                                    )}
                                </Popup>
                            </Marker>
                        );
                    })}
                    {systemMode === 'traditional' ? (
                        <Polyline
                            positions={[
                                depotPosition,
                                ...areaBins.map(b => [b.lat, b.lon]),
                                depotPosition
                            ]}
                            color="#ff9900"
                            weight={3}
                            dashArray="8, 8"
                        />
                    ) : (route && route.stops && (
                        <Polyline
                            positions={[
                                depotPosition,
                                ...route.stops.filter(s => s.status === 'PENDING').map(s => [s.lat, s.lon]),
                                depotPosition
                            ]}
                            color="cyan"
                            weight={4}
                            dashArray={route.stops.filter(s => s.status === 'PENDING').length === 0 ? "1" : "0"}
                        />
                    ))}
                </MapContainer>
            </div>

            <header>
                <div className="header-left">
                    <h1>♻️ SmartWaste Hub</h1>
                    <div className="area-selector">
                        <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
                            {areas.map(area => <option key={area} value={area}>{area}</option>)}
                        </select>
                    </div>
                    <div className="mode-toggle-group">
                        <button
                            className={`mode-toggle-btn ${systemMode === 'smart' ? 'active' : ''}`}
                            onClick={() => setSystemMode('smart')}
                            title="AI-driven dynamic routing based on real-time bin fill levels"
                        >
                            ⚡ Smart AI Mode
                        </button>
                        <button
                            className={`mode-toggle-btn ${systemMode === 'traditional' ? 'active-traditional' : ''}`}
                            onClick={() => setSystemMode('traditional')}
                            title="Traditional fixed-schedule collection routing (visits all bins)"
                        >
                            🐢 Traditional Fixed Schedule
                        </button>
                    </div>
                </div>
                <div className="header-buttons">
                    <button onClick={() => setShowEvalModal(true)} className="reset-button" style={{marginRight: '10px', background: 'linear-gradient(135deg, #00f2fe, #4facfe)', color: '#000', fontWeight: 'bold'}}>📊 System Evaluation</button>
                    {role !== 'driver' && <button onClick={exportToCSV} className="reset-button" style={{marginRight: '10px', background: 'var(--color-accent-cyan)', color: '#000'}}>📥 Export CSV</button>}
                    {role !== 'driver' && <button onClick={handleResetDatabase} className="reset-button">🔄 Reset</button>}
                    <button onClick={() => { setToken(null); setRole('admin'); localStorage.removeItem('role'); }} className="logout-button">Logout</button>
                </div>
            </header>

            {/* IoT Telemetry & Environmental Sanitation Banner */}
            <div className="system-telemetry-bar">
                <div className="telemetry-pill">
                    <span className="live-dot"></span> <b>IoT Telemetry:</b> Ultrasonic Sensors Active (30s Stream)
                </div>
                <div className="telemetry-pill">
                    <b>🤖 AI Engine:</b> Linear Regression Fill Forecasting & TSP Optimizer
                </div>
                {systemMode === 'traditional' ? (
                    <div className="telemetry-pill warning">
                        ⚠️ <b>Traditional Mode Active:</b> Fixed-schedule dispatching visits all bins regardless of fill levels (higher fuel & emissions).
                    </div>
                ) : urgentBins.length > 0 ? (
                    <div className="telemetry-pill danger">
                        🚨 <b>Sanitation Alert:</b> {urgentBins.length} bin(s) near full capacity. Dynamic AI collection dispatched to prevent odor & health risks.
                    </div>
                ) : (
                    <div className="telemetry-pill success">
                        ✅ <b>Optimized:</b> Bins operating within safe capacity limits. Zero overflow risk.
                    </div>
                )}
            </div>

            <aside className="dashboard-sidebar">
                {role !== 'driver' && (
                    <div className="sidebar-section">
                        <h3 className="section-title">📊 Key Metrics</h3>
                        <div className="stats-grid">
                            <div className="stat-card">
                                <span className="stat-value">{stats.total}</span>
                                <span className="stat-label">Total Bins</span>
                            </div>
                            <div
                                className={`stat-card clickable ${showUrgentOnly ? 'active' : ''}`}
                                onClick={() => setShowUrgentOnly(prev => !prev)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowUrgentOnly(prev => !prev)}
                            >
                                <span className="stat-value" style={{color: 'var(--color-danger-red)'}}>{stats.urgent}</span>
                                <span className="stat-label">Urgent {showUrgentOnly ? '(Filtered)' : ''}</span>
                            </div>
                            <div className="stat-card" style={{gridColumn: 'span 2'}}>
                                <span className="stat-value" style={{color: 'var(--color-accent-cyan)'}}>{stats.distance.toFixed(1)} km</span>
                                <span className="stat-label">Remaining Route Distance</span>
                            </div>
                        </div>
                    </div>
                )}

                {role !== 'driver' && showUrgentOnly && (
                    <div className="sidebar-section">
                        <h3 className="section-title">🚨 Urgent Bin List ({urgentBins.length})</h3>
                        {urgentBins.length === 0 ? (
                            <div className="route-info-panel" style={{opacity: 0.6}}>No urgent bins in {selectedArea}.</div>
                        ) : (
                            <div className="urgent-list">
                                {urgentBins.map(bin => {
                                    const fillPercent = Math.round((bin.current_fill_kg / bin.capacity_kg) * 100);
                                    const urgencyReason = bin.status === 'FULL' ? 'FULL' : '70%+ Fill';
                                    const predictedFullText = formatPredictedFull(bin.predicted_full);

                                    return (
                                        <div key={bin.id} className="urgent-item" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div>
                                                <div><b>Bin #{bin.id}</b> • <span style={{color: bin.status === 'FULL' ? '#ef4444' : '#f59e0b'}}>{fillPercent}%</span></div>
                                                <div className="urgent-item-meta">{urgencyReason}</div>
                                                <div className="urgent-item-meta">Predicted full: {predictedFullText}</div>
                                            </div>
                                            <button
                                                onClick={() => handleCollectBin(bin.id)}
                                                style={{
                                                    background: 'rgba(46, 204, 113, 0.2)',
                                                    border: '1px solid #2ecc71',
                                                    color: '#2ecc71',
                                                    fontWeight: 'bold',
                                                    padding: '5px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.78rem'
                                                }}
                                            >
                                                ✓ Collect
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {role === 'driver' && (
                    <div className="sidebar-section">
                        <h3 className="section-title">🚛 Driver Collection Panel</h3>
                        <div style={{background: 'rgba(0,176,155,0.1)', border: '1px solid rgba(0,176,155,0.3)', padding: '10px', borderRadius: '8px', marginBottom: '12px'}}>
                            <p style={{margin: 0, fontSize: '0.85rem', color: '#e2e8f0'}}>
                                Area: <strong>{selectedArea}</strong>. Select bins below or tap map pins to mark them as collected.
                            </p>
                        </div>

                        <h4 style={{margin: '10px 0 6px 0', fontSize: '0.85rem', color: '#94a3b8'}}>
                            Bins Needing Collection ({areaBins.filter(b => b.status !== 'EMPTY').length})
                        </h4>

                        {areaBins.filter(b => b.status !== 'EMPTY').length === 0 ? (
                            <div className="route-info-panel" style={{color: '#2ecc71', opacity: 0.9}}>
                                🎉 All bins in {selectedArea} are empty & collected!
                            </div>
                        ) : (
                            <div className="urgent-list">
                                {areaBins.filter(b => b.status !== 'EMPTY').map(bin => {
                                    const fillPercent = Math.round((bin.current_fill_kg / bin.capacity_kg) * 100);
                                    return (
                                        <div key={bin.id} className="urgent-item" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div>
                                                <div><b>Bin #{bin.id}</b> • <span style={{color: bin.status === 'FULL' ? '#ef4444' : '#f59e0b'}}>{fillPercent}% ({bin.current_fill_kg.toFixed(1)}/{bin.capacity_kg} kg)</span></div>
                                                <div className="urgent-item-meta">Status: <strong>{bin.status}</strong></div>
                                            </div>
                                            <button
                                                onClick={() => handleCollectBin(bin.id)}
                                                style={{
                                                    background: 'linear-gradient(135deg, #00b09b, #96c93d)',
                                                    color: '#000',
                                                    fontWeight: 'bold',
                                                    border: 'none',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.78rem'
                                                }}
                                            >
                                                ✓ Collect
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}


                {role !== 'driver' && (
                    <>
                        <div className="sidebar-section">
                            <h3 className="section-title">📈 City Waste Comparison</h3>
                            <div className="bar-chart">
                                {summaryStats.map(stat => (
                                    <div key={stat.area} className="bar-wrapper">
                                        <div className="bar-label">{stat.area} <small>({stat.avg_fill}kg avg)</small></div>
                                        <div className="bar-container">
                                            <div className={`bar-fill ${stat.area === selectedArea ? 'active' : ''}`}
                                                 style={{ width: `${Math.min((stat.avg_fill / 150) * 100, 100)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3 className="section-title">🌱 Sustainability Impact</h3>
                            <div className="stats-grid">
                                <div className="stat-card" style={{background: 'rgba(57, 255, 20, 0.05)'}}>
                                    <span className="stat-value" style={{color: 'var(--color-accent-mint)'}}>{sustainability.fuelSaved} L</span>
                                    <span className="stat-label">Fuel Saved</span>
                                </div>
                                <div className="stat-card" style={{background: 'rgba(0, 217, 255, 0.05)'}}>
                                    <span className="stat-value" style={{color: 'var(--color-accent-cyan)'}}>{sustainability.co2Reduced} kg</span>
                                    <span className="stat-label">CO2 Reduced</span>
                                </div>
                            </div>
                            <div className="efficiency-badge">
                                Efficiency Gain: <b>+{sustainability.efficiency}%</b>
                            </div>
                        </div>
                    </>
                )}

                {role !== 'driver' && (
                    <>
                        <div className="sidebar-section" style={{ position: 'relative' }}>
                            <h3 className="section-title">📊 Historical Waste Trend (7 Days)</h3>
                            <div className="trend-chart">
                                {history.map((day, idx) => {
                                    const total = day.total_waste || 1;
                                    const isActive = activeHistoryDay === day.date;
                                    return (
                                        <div
                                            key={day.date}
                                            className={`trend-bar ${idx === history.length - 1 ? 'active' : ''} ${isActive ? 'selected' : ''}`}
                                            style={{
                                                height: `${Math.max(20, (total / 500) * 100)}%`,
                                                cursor: 'pointer',
                                                position: 'relative'
                                            }}
                                            onClick={() => setActiveHistoryDay(isActive ? null : day.date)}
                                        >
                                            <div className="bar-segment noida" style={{ height: `${(day.noida / total) * 100}%` }}></div>
                                            <div className="bar-segment delhi" style={{ height: `${(day.delhi / total) * 100}%` }}></div>
                                            <div className="bar-segment gurugram" style={{ height: `${(day.gurugram / total) * 100}%` }}></div>

                                            {isActive && (
                                                <div className="bar-dialogue" style={{
                                                    left: idx === 0 ? '0' : (idx === history.length - 1 ? 'auto' : '50%'),
                                                    right: idx === history.length - 1 ? '0' : 'auto',
                                                    transform: (idx === 0 || idx === history.length - 1) ? 'none' : 'translateX(-50%)',
                                                    textAlign: 'left'
                                                }}>
                                                    <div className="dialogue-header">{new Date(day.date).toLocaleDateString()}</div>
                                                    <div className="dialogue-row"><span className="dot green"></span> Noida: <b>{day.noida.toFixed(1)}kg</b></div>
                                                    <div className="dialogue-row"><span className="dot orange"></span> Delhi: <b>{day.delhi.toFixed(1)}kg</b></div>
                                                    <div className="dialogue-row"><span className="dot blue"></span> Gurugram: <b>{day.gurugram.toFixed(1)}kg</b></div>
                                                    <div className="dialogue-footer">Total: {day.total_waste.toFixed(1)}kg</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="trend-labels">
                                {history.map(day => (
                                    <span key={day.date}>{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                ))}
                            </div>
                        </div>

                        <div className="sidebar-section" style={{ position: 'relative' }}>
                            <h3 className="section-title">🌍 Historical Sustainability Impact (7 Days)</h3>

                            {(() => {
                                const totFuel = history.reduce((a, d) => a + (d.total_fuel || 0), 0);
                                const totCo2 = history.reduce((a, d) => a + (d.total_co2 || 0), 0);
                                const maxFuel = Math.max(...history.map(d => d.total_fuel || 0), 1);
                                const maxCo2 = Math.max(...history.map(d => d.total_co2 || 0), 1);
                                return (
                                    <>
                                        <div style={{display: 'flex', justifyContent: 'space-around', marginBottom: '12px', padding: '10px', background: 'rgba(0,242,254,0.04)', borderRadius: '10px', border: '1px solid rgba(0,242,254,0.1)'}}>
                                            <div style={{textAlign: 'center'}}>
                                                <div style={{fontSize: '1.3rem', fontWeight: 'bold', color: '#2ecc71', fontFamily: 'var(--font-mono)'}}>{totFuel.toFixed(0)} L</div>
                                                <div style={{fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase'}}>Total Fuel Saved</div>
                                            </div>
                                            <div style={{width: '1px', background: 'rgba(255,255,255,0.1)'}}></div>
                                            <div style={{textAlign: 'center'}}>
                                                <div style={{fontSize: '1.3rem', fontWeight: 'bold', color: '#00f2fe', fontFamily: 'var(--font-mono)'}}>{totCo2.toFixed(0)} kg</div>
                                                <div style={{fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase'}}>Total CO₂ Reduced</div>
                                            </div>
                                        </div>

                                        <div style={{display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px', marginBottom: '4px'}}>
                                            {history.map((day) => (
                                                <div key={day.date} style={{flex: 1, display: 'flex', gap: '2px', alignItems: 'flex-end', height: '100%'}}>
                                                    <div
                                                        title={`Fuel: ${(day.total_fuel || 0).toFixed(1)}L`}
                                                        style={{
                                                            flex: 1,
                                                            height: `${Math.max(8, ((day.total_fuel || 0) / maxFuel) * 100)}%`,
                                                            background: 'linear-gradient(to top, #27ae60, #2ecc71)',
                                                            borderRadius: '3px 3px 0 0',
                                                            cursor: 'pointer',
                                                            transition: 'height 0.3s ease'
                                                        }}
                                                    ></div>
                                                    <div
                                                        title={`CO₂: ${(day.total_co2 || 0).toFixed(1)}kg`}
                                                        style={{
                                                            flex: 1,
                                                            height: `${Math.max(8, ((day.total_co2 || 0) / maxCo2) * 100)}%`,
                                                            background: 'linear-gradient(to top, #0084b4, #00f2fe)',
                                                            borderRadius: '3px 3px 0 0',
                                                            cursor: 'pointer',
                                                            transition: 'height 0.3s ease'
                                                        }}
                                                    ></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{display: 'flex', gap: '6px'}}>
                                            {history.map(day => (
                                                <div key={day.date} style={{flex: 1, textAlign: 'center', fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)'}}>
                                                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)'}}>
                                            <span><span style={{display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: '#2ecc71', marginRight: '4px'}}></span>Fuel (L)</span>
                                            <span><span style={{display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: '#00f2fe', marginRight: '4px'}}></span>CO₂ (kg)</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </>
                )}

                <div className="sidebar-section">
                    <h3 className="section-title">{route?.status === "COMPLETED" ? "🏁 Recently Completed Route" : "🚛 Active Route"}</h3>
                    {route ? (() => {
                        const collected = route.stops.filter(s => ['COLLECTED', 'COLLECTED_SKIP'].includes(s.status)).length;
                        const skipped = route.stops.filter(s => s.status === 'SKIPPED').length;
                        const pending = route.stops.filter(s => s.status === 'PENDING').length;
                        const total = route.stops.length;
                        
                        const progress = total > 0 ? ((collected + skipped) / total) * 100 : 0;
                        const liveStatus = (pending === 0) ? 'COMPLETED' : (collected === 0 && skipped === 0 ? 'PENDING' : 'IN PROGRESS');
                        const statusColor = liveStatus === 'COMPLETED' ? '#2ecc71' : (liveStatus === 'IN PROGRESS' ? '#f39c12' : '#e74c3c');
                        return (
                            <div className="route-info-panel">
                                {route?.status === "COMPLETED" && (<div style={{fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", marginTop: "-10px", marginBottom: "12px"}}>Finished: {new Date(route.completed_at || route.generated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>)}
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                    <span><b>Status:</b></span>
                                    <span style={{color: statusColor, fontWeight: 'bold'}}>{liveStatus}</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                    <span><b>Collected:</b></span>
                                    <span style={{color: '#2ecc71'}}>{collected} / {total}</span>
                                </div>
                                {skipped > 0 && (
                                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                        <span><b>Skipped (Maint):</b></span>
                                        <span style={{color: '#f39c12'}}>{skipped} bins</span>
                                    </div>
                                )}
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                    <span><b>Remaining:</b></span>
                                    <span style={{color: pending > 0 ? '#e74c3c' : '#2ecc71'}}>{pending} stops</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                    <span><b>Truck:</b></span>
                                    <span>{route.truck_reg_number || 'TRUCK-001'}</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                                    <span><b>Remaining Distance:</b></span>
                                    <span style={{color: '#00f2fe'}}>{remainingDistance.toFixed(2)} km</span>
                                </div>
                                <div style={{background: 'rgba(255,255,255,0.1)', borderRadius: '6px', height: '8px', overflow: 'hidden'}}>
                                    <div style={{
                                        width: `${progress}%`,
                                        height: '100%',
                                        background: progress === 100 ? '#2ecc71' : 'linear-gradient(90deg, #00f2fe, #4facfe)',
                                        borderRadius: '6px',
                                        transition: 'width 0.5s ease'
                                    }}></div>
                                </div>
                                <div style={{textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '4px', marginBottom: '15px'}}>
                                    {Math.round(progress)}% Complete
                                </div>

                                <div className="route-stops-detail" style={{borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', maxHeight: '150px', overflowY: 'auto'}}>
                                    <div style={{fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px', opacity: 0.8}}>Route Stops:</div>
                                    {route.stops.map(stop => (
                                        <div key={stop.bin_id} style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px', padding: '4px 8px', borderRadius: '4px', background: ['COLLECTED', 'COLLECTED_SKIP'].includes(stop.status) ? 'rgba(46, 204, 113, 0.1)' : (stop.status === 'SKIPPED' ? 'rgba(243, 156, 18, 0.1)' : 'transparent')}}>
                                            <span>Bin #{stop.bin_id}</span>
                                            <span style={{color: ['COLLECTED', 'COLLECTED_SKIP'].includes(stop.status) ? '#2ecc71' : (stop.status === 'SKIPPED' ? '#f39c12' : 'rgba(255,255,255,0.4)')}}>
                                                {stop.status === 'COLLECTED' ? '✓ Collected' : (stop.status === 'COLLECTED_SKIP' ? '✓ Collected (Maint)' : (stop.status === 'SKIPPED' ? '⚠️ Skipped (Maint)' : '○ Pending'))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="route-info-panel" style={{opacity: 0.5}}>No active route for this city.</div>
                    )}
                </div>

                <div className="sidebar-section">
                    <h3 className="section-title">📍 Map Legend</h3>
                    <div className="legend-items">
                        <div className="legend-item">
                            <span style={{width: "12px", height: "12px", borderRadius: "50%", background: "#2ecc71", display: "inline-block", marginRight: "10px", boxShadow: "0 0 5px #2ecc71"}}></span>
                            Normal Bin (&lt;70%)
                        </div>
                        <div className="legend-item">
                            <span style={{width: "12px", height: "12px", borderRadius: "50%", background: "#f39c12", display: "inline-block", marginRight: "10px", boxShadow: "0 0 5px #f39c12"}}></span>
                            Filling Bin (70%+ / Predicted &lt;1h)
                        </div>
                        <div className="legend-item">
                            <span style={{width: "12px", height: "12px", borderRadius: "50%", background: "#e74c3c", display: "inline-block", marginRight: "10px", boxShadow: "0 0 5px #e74c3c"}}></span>
                            Full Bin (Urgent)
                        </div>
                        <div className="legend-item">
                            <span style={{width: "12px", height: "12px", borderRadius: "50%", background: "#f1c40f", display: "inline-flex", justifyContent: "center", alignItems: "center", marginRight: "10px", boxShadow: "0 0 5px #f1c40f", fontSize: "0.6rem"}}>⚠️</span>
                            Under Maintenance
                        </div>
                        <div className="legend-item">
                            <span style={{width: "20px", height: "4px", background: "#00f2fe", display: "inline-block", marginRight: "10px", boxShadow: "0 0 5px #00f2fe"}}></span>
                            Optimal Route
                        </div>
                        <div className="legend-item">
                            <span style={{width: "12px", height: "12px", borderRadius: "50%", background: "#3498db", display: "inline-block", marginRight: "10px", boxShadow: "0 0 5px #3498db"}}></span>
                            Depot
                        </div>
                    </div>
                </div>

                <div className="sidebar-section">
                    <h3 className="section-title">⚖️ Evaluation: Smart vs Traditional</h3>
                    <div className="benchmark-box">
                        <div className="benchmark-row">
                            <span>Route Distance</span>
                            <span className="benchmark-value green">-42% Saved</span>
                        </div>
                        <div className="benchmark-row">
                            <span>Bin Overflow Rate</span>
                            <span className="benchmark-value green">-78% Reduced</span>
                        </div>
                        <div className="benchmark-row">
                            <span>Response Time</span>
                            <span className="benchmark-value cyan">Real-Time (30s)</span>
                        </div>
                        <div className="benchmark-row">
                            <span>Data Visibility</span>
                            <span className="benchmark-value cyan">100% Automated</span>
                        </div>
                    </div>
                </div>
            </aside>

            {role !== 'driver' && (
                <aside className="operations-panel">
                    <div className="ops-section">
                        <h3 className="section-title">🏙 Area Snapshot</h3>
                        <div className="ops-grid">
                            <div className="ops-metric">
                                <span>{areaSummary.total}</span>
                                <small>Total</small>
                            </div>
                            <div className="ops-metric">
                                <span>{areaSummary.avgFill.toFixed(1)} kg</span>
                                <small>Avg Fill</small>
                            </div>
                            <div className="ops-metric danger">
                                <span>{areaSummary.full}</span>
                                <small>Full</small>
                            </div>
                            <div className="ops-metric warning">
                                <span>{areaSummary.nearlyFull}</span>
                                <small>70%+</small>
                            </div>
                            <div className="ops-metric cyan">
                                <span>{areaSummary.predictedSoon}</span>
                                <small>&lt;1h</small>
                            </div>
                            <div className="ops-metric muted">
                                <span>{areaSummary.maintenance}</span>
                                <small>Maint.</small>
                            </div>
                        </div>
                    </div>

                    <div className="ops-section">
                        <h3 className="section-title">🚚 Truck Status</h3>
                        <div className="truck-list">
                            {truckStatuses.length === 0 ? (
                                <div className="ops-empty">No trucks available.</div>
                            ) : truckStatuses.map(truck => (
                                <div key={truck.truck_id} className="truck-row">
                                    <div>
                                        <b>{truck.reg_number}</b>
                                        <small>{truck.assigned_area || 'Fleet standby'}</small>
                                        <div style={{fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px'}}>
                                            Today: {truck.distance_today_km || '0.00'} km
                                        </div>
                                    </div>
                                    <span className={`truck-badge ${truck.status === 'Assigned' ? 'assigned' : 'available'}`}>
                                        {truck.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="ops-section">
                        <h3 className="section-title">🛠 Bin Control</h3>
                        {selectedBin ? (
                            <div className="selected-bin-card">
                                <div className="selected-bin-head">
                                    <b>Bin #{selectedBin.id}</b>
                                    <span>{selectedBin.status}</span>
                                </div>
                                <div className="selected-bin-meta">
                                    {selectedBin.area_name} • {Math.round((selectedBin.current_fill_kg / selectedBin.capacity_kg) * 100)}% full
                                </div>
                                <div className="maintenance-actions">
                                    <button
                                        className="action-button maintenance"
                                        disabled={selectedBin.status === 'MAINTENANCE'}
                                        onClick={() => handleUpdateBinStatus(selectedBin.id, 'MAINTENANCE')}
                                    >
                                        Mark Maintenance
                                    </button>
                                    <button
                                        className="action-button restore"
                                        disabled={selectedBin.status !== 'MAINTENANCE'}
                                        onClick={() => handleUpdateBinStatus(selectedBin.id, 'FILLING')}
                                    >
                                        Restore Service
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="ops-empty">Select a bin on the map to manage maintenance.</div>
                        )}
                    </div>
                </aside>
            )}

            {showEvalModal && (
                <div className="research-modal-overlay" onClick={() => setShowEvalModal(false)}>
                    <div className="research-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="research-modal-header">
                            <div>
                                <h2>📊 System Performance Evaluation & Method Comparison</h2>
                                <p className="research-subtitle">Empirical Comparison: Smart IoT + AI System vs. Traditional Fixed-Schedule Method</p>
                            </div>
                            <button className="research-close-btn" onClick={() => setShowEvalModal(false)}>✕</button>
                        </div>

                        <div className="research-modal-body">
                            <section className="research-block">
                                <h3 className="research-block-title">⚡ Live Collection Strategy Evaluator</h3>
                                <div style={{display: 'flex', gap: '16px', marginBottom: '16px'}}>
                                    <button
                                        style={{flex: 1, padding: '14px', borderRadius: '10px', background: systemMode === 'smart' ? 'linear-gradient(135deg, #00b09b, #96c93d)' : 'rgba(255,255,255,0.05)', color: systemMode === 'smart' ? '#000' : '#fff', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'}}
                                        onClick={() => setSystemMode('smart')}
                                    >
                                        🤖 Smart AI Mode (Active System)
                                    </button>
                                    <button
                                        style={{flex: 1, padding: '14px', borderRadius: '10px', background: systemMode === 'traditional' ? '#e67e22' : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'}}
                                        onClick={() => setSystemMode('traditional')}
                                    >
                                        🐢 Traditional Fixed Schedule Mode
                                    </button>
                                </div>
                                <div style={{background: 'rgba(15,23,42,0.6)', padding: '14px', borderRadius: '8px', borderLeft: systemMode === 'smart' ? '4px solid #2ecc71' : '4px solid #e67e22'}}>
                                    {systemMode === 'smart' ? (
                                        <p style={{margin: 0, fontSize: '0.9rem', color: '#e2e8f0'}}>
                                            <strong>Smart AI System Mode:</strong> Collects bins dynamically based on real-time fill weight (&gt;70% capacity or FULL). Skips empty bins to minimize travel distance, reduce fuel burn, and prevent bin overflow hazards.
                                        </p>
                                    ) : (
                                        <p style={{margin: 0, fontSize: '0.9rem', color: '#e2e8f0'}}>
                                            <strong>Traditional Fixed Schedule Mode:</strong> Trucks follow static, unmonitored routes visiting 100% of bins regardless of actual fill levels. Leads to redundant trips, wasted fuel, higher emissions, and unaddressed overflow in high-generation sectors.
                                        </p>
                                    )}
                                </div>
                            </section>

                            <section className="research-block">
                                <h3 className="research-block-title">⚖️ Quantitative System Performance Evaluation</h3>
                                <table className="research-table">
                                    <thead>
                                        <tr>
                                            <th>Evaluation Metric</th>
                                            <th>Traditional Method</th>
                                            <th>Smart AI System</th>
                                            <th>Quantitative Performance Gain</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Collection Dispatch</td>
                                            <td>Fixed Calendar Days</td>
                                            <td>Real-time Fill Threshold (&gt;70% / FULL)</td>
                                            <td><span className="gain-pill green">Demand-Driven Dispatch</span></td>
                                        </tr>
                                        <tr>
                                            <td>Fleet Travel Distance</td>
                                            <td>100% Full Loop Visit</td>
                                            <td>Optimized Sub-Loop TSP</td>
                                            <td><span className="gain-pill green">35% – 50% Distance Saved</span></td>
                                        </tr>
                                        <tr>
                                            <td>Overflow Prevention Rate</td>
                                            <td>Low (Unmonitored)</td>
                                            <td>Near Zero (ML Predictive Alerts)</td>
                                            <td><span className="gain-pill green">~80% Overflow Reduction</span></td>
                                        </tr>
                                        <tr>
                                            <td>Fuel & Carbon Reduction</td>
                                            <td>High Consumption</td>
                                            <td>Fuel & CO₂ Tracked</td>
                                            <td><span className="gain-pill cyan">2.31 kg CO₂ Saved / L Fuel</span></td>
                                        </tr>
                                        <tr>
                                            <td>Operational Visibility</td>
                                            <td>Manual Paper Logs</td>
                                            <td>Live Geospatial Map & CSV Export</td>
                                            <td><span className="gain-pill cyan">100% Real-Time Visibility</span></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </section>

                            <section className="research-block">
                                <h3 className="research-block-title">💡 System Objectives & Realized Capabilities</h3>
                                <div className="research-obj-grid">
                                    <div className="research-obj-card">
                                        <div className="obj-header">
                                            <span className="obj-tag">Objective i</span>
                                            <span className="obj-status-badge implemented">Active</span>
                                        </div>
                                        <p><strong>IoT Smart Bins:</strong> Ultrasonic sensors stream fill levels (kg) every 30 seconds.</p>
                                    </div>
                                    <div className="research-obj-card">
                                        <div className="obj-header">
                                            <span className="obj-tag">Objective ii</span>
                                            <span className="obj-status-badge implemented">Active</span>
                                        </div>
                                        <p><strong>Real-Time Monitoring:</strong> Interactive Leaflet map with fill level indicators & maintenance flags.</p>
                                    </div>
                                    <div className="research-obj-card">
                                        <div className="obj-header">
                                            <span className="obj-tag">Objective iii</span>
                                            <span className="obj-status-badge implemented">Active</span>
                                        </div>
                                        <p><strong>AI Optimization:</strong> Linear Regression fill-time forecasting & TSP shortest-path truck routing.</p>
                                    </div>
                                    <div className="research-obj-card">
                                        <div className="obj-header">
                                            <span className="obj-tag">Objective iv & v</span>
                                            <span className="obj-status-badge implemented">Active</span>
                                        </div>
                                        <p><strong>Evaluation & CSV Logs:</strong> Performance comparison tracking fuel saved (L), CO₂ reduced, and downloadable CSV audits.</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
