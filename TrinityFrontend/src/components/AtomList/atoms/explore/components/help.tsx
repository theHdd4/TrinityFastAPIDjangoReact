"use client"

import { useState, useEffect, useCallback } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import axios from "axios"
import { PieChart, Pie, Cell, Legend } from "recharts"

// Brand colors matching the demo exactly
const MAIN_BRANDS = ["Brand1", "Brand2", "Brand3", "Brand4"]
const BRAND_COLORS = {
  Brand1: "#fbbf24", // Yellow/Orange
  Brand2: "#3b82f6", // Blue
  Brand3: "#10b981", // Green
  Brand4: "#8dd3c7", // Light Green/Teal
  restofcategory: "#a3a3a3", // Gray for other categories
  cat1: "#f472b6", // Pink for cat1
}

// Color mapping for years (to match demo)
const YEAR_COLORS = {
  2021: "#3b82f6", // Blue
  2022: "#fbbf24", // Yellow/Orange
  2023: "#10b981", // Green
  2024: "#8dd3c7", // Light Green/Teal
}

const API_BASE_URL = "http://localhost:8000"

function App() {
  const [theme, setTheme] = useState("light")
  const [activeTab, setActiveTab] = useState("Trends")
  const [activeFilterTab, setActiveFilterTab] = useState("Correlation and Trends")

  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    packTypes: [],
    ppgs: [],
    channels: [],
    years: [],
  })

  const [filters, setFilters] = useState({
    channel: "All",
    brand: "All",
    packType: "All",
    ppg: "All",
    year: "All",
  })

  const [chartData, setChartData] = useState({
    salesValueByYear: [],
    volumeByYear: [],
    monthlyTrend: [],
    brandComparison: [],
  })

  const [loading, setLoading] = useState(true)

  // Add state for market share data and toggle
  const [marketShareData, setMarketShareData] = useState({ labels: [], sales_values: [], volume_values: [] })
  const [marketShareType, setMarketShareType] = useState("sales")

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  // Fetch filter options on component mount
  useEffect(() => {
    fetchFilterOptions()
  }, [])

  // Fetch data when filters change
  useEffect(() => {
    if (filterOptions.brands.length > 0) {
      fetchAllData()
    }
  }, [filters, filterOptions])

  const fetchFilterOptions = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/filter-options/`)
      setFilterOptions({
        brands: res.data.brands || [],
        packTypes: res.data.pack_types || [],
        ppgs: res.data.ppgs || [],
        channels: res.data.channels || [],
        years: res.data.years || [],
      })
    } catch (error) {
      console.error("Error fetching filter options:", error)
    }
  }

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // Prepare params for API
      const params = {
        brand: filters.brand === "All" ? "all" : filters.brand,
        pack_type: filters.packType === "All" ? "all" : filters.packType,
        ppg: filters.ppg === "All" ? "all" : filters.ppg,
        channel: filters.channel === "All" ? "all" : filters.channel,
        year: filters.year === "All" ? "all" : filters.year,
      }
      // Fetch all chart data from backend
      const [salesRes, volumeRes, yearWiseRes, monthlyTrendRes, marketShareRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/sales-value-by-year/`, { params }),
        axios.get(`${API_BASE_URL}/api/volume-by-year/`, { params }),
        axios.get(`${API_BASE_URL}/api/year-wise-sales-value/`, { params }),
        axios.get(`${API_BASE_URL}/api/monthly-trend/`, { params }),
        axios.get(`${API_BASE_URL}/api/market-share/`, { params }),
      ])
      // Parse vertical bar chart (year-wise sales value)
      const brandComparison = (yearWiseRes.data.labels || []).map((year, i) => ({
        brand: year,
        value: yearWiseRes.data.values[i],
      }))
      // Parse line chart (monthly trend)
      const monthlyTrend = (monthlyTrendRes.data.labels || []).map((month, i) => ({
        month,
        value: monthlyTrendRes.data.values[i],
      }))
      setChartData((prev) => ({
        ...prev,
        salesValueByYear: salesRes.data,
        volumeByYear: volumeRes.data,
        brandComparison,
        monthlyTrend,
      }))
      setMarketShareData(marketShareRes.data)
    } catch (error) {
      console.error("Error fetching chart data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = useCallback((filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      channel: "All",
      brand: "All",
      packType: "All",
      ppg: "All",
      year: "All",
    })
  }, [])

  // Shortened format for Y-axis (K for thousands, M for millions)
  const formatValueShort = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "";
    }
    if (value >= 1000000) {
      return `${Math.round(value / 1000000)}M`;
    } else if (value >= 1000) {
      return `${Math.round(value / 1000)}K`;
    }
    return value.toString();
  }

  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `€${(value / 1000000).toFixed(0)}M`
    }
    return `€${value.toLocaleString()}`
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length > 0) {
      return (
        <div style={{
          background: '#222',
          color: '#fff',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          minWidth: 0,
          boxShadow: 'none',
          border: 'none',
        }}>
          <div style={{ marginBottom: 4 }}>{label}</div>
          {payload.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: d.color
              }} />
              <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
              <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const CustomLegend = ({ payload }) => {
    return (
      <div className="custom-legend">
        {payload.map((entry, index) => (
          <div key={index} className="legend-item">
            <div className="legend-color" style={{ backgroundColor: entry.color }} />
            <span>{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  const CustomDot = (props) => {
    const { cx, cy, payload } = props
    if (payload && payload.highlight) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />
          <text x={cx} y={cy - 15} textAnchor="middle" className="text-xs font-medium" fill="var(--text-primary)">
            {formatValueShort(payload.value)}
          </text>
        </g>
      )
    }
    return <circle cx={cx} cy={cy} r={3} fill="#10b981" />
  }

  const LoadingChart = () => (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <div className="loading-text">Loading chart data...</div>
    </div>
  )

  // Transform year-wise sales value for grouped bar chart by brand
  const brands = MAIN_BRANDS
  const years = [2021, 2022, 2023, 2024]
  const brandComparisonData = brands.map((brand) => {
    const row = { brand }
    ;(chartData.salesValueByYear || []).forEach((item) => {
      row[item.year] = item[brand] || 0
    })
    return row
  })

  // For the line chart, format X-axis as 'Mon YYYY'
  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split("-")
    const date = new Date(year, month - 1)
    return date.toLocaleString("default", { month: "short", year: "numeric" })
  }

  const pieData = ['Brand1', 'Brand2', 'Brand3', 'Brand4']
    .map((brand) => ({
      name: brand,
      value: marketShareType === 'sales'
        ? marketShareData.sales_values[marketShareData.labels.indexOf(brand)]
        : marketShareData.volume_values[marketShareData.labels.indexOf(brand)],
    }))
    .filter(d => d.value !== undefined && d.value !== 0 && !isNaN(d.value));

  return (
    <div className="app" style={{ height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <header className="header" style={{ padding: '0.5rem 1rem', minHeight: 48 }}>
        <div className="header-left">
          <div className="menu-icon" style={{ width: 32, height: 32 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </div>
          <div className="logo" style={{ fontSize: '1rem', marginLeft: 8 }}>
            <div className="logo-icon" style={{ fontSize: '1.2rem' }}>Q</div>
            <span style={{ fontWeight: 600 }}>QUANT MATRIX AI</span>
          </div>
        </div>
        <div className="header-right" style={{ gap: 8 }}>
          <div className="project-name" style={{ fontSize: '0.9rem', marginRight: 8 }}>Project Name</div>
          <div className="header-icons" style={{ gap: 4 }}>
            <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '1rem' }}>JD</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content" style={{ height: "calc(100vh - 80px)", overflowY: "auto", padding: "1rem", background: "#f3f4f6" }}>
        {/* Page Header with Tabs on Right */}
        <div className="page-header" style={{ marginBottom: '0.5rem', minHeight: 32 }}>
          <h1 className="page-title" style={{ fontSize: '1.3rem', margin: 0, fontWeight: 600, color: "grey" }}>
            Consumer Surplus Factor (CSF)
          </h1>
          <nav className="tab-navigation" style={{ gap: 8, fontSize: '0.95rem' }}>
            {["Trends", "CSF Results", "Scenario Planning"].map((tab) => (
              <div
                key={tab}
                className={`tab-item ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </div>
            ))}
          </nav>
        </div>

        {/* Filter Section */}
        <div className="filter-section slide-in" style={{ marginBottom: '0.5rem', padding: '1.2rem 1.5rem 1.2rem 1.5rem', minHeight: 0, background: '#f5f5f5', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="filter-tabs" style={{ gap: 32, fontSize: '1rem', marginBottom: 24, display: 'flex', background: 'none', borderRadius: 0, padding: 0, borderBottom: '2px solid #e5e7eb' }}>
            {['Brand', 'Pack Type', 'PPG', 'Brand X Pack Type X PPG', 'Correlation and Trends'].map((tab) => (
              <div
                key={tab}
                className={`filter-tab ${activeFilterTab === tab ? "active" : ""}`}
                onClick={() => setActiveFilterTab(tab)}
                style={{
                  padding: '0 0 10px 0',
                  fontWeight: activeFilterTab === tab ? 700 : 500,
                  color: activeFilterTab === tab ? '#222' : '#888',
                  borderBottom: activeFilterTab === tab ? '3px solid #222' : '3px solid transparent',
                  background: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.15s',
                }}
              >
                {tab}
              </div>
            ))}
          </div>
          <div className="filters-grid" style={{ gap: 18, display: 'flex', flexWrap: 'wrap', marginTop: 0 }}>
            <div className="filter-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <label className="filter-label" style={{ fontSize: '0.95rem', color: '#444', marginBottom: 6 }}>Channel</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="filter-select"
                  value={filters.channel}
                  onChange={(e) => handleFilterChange("channel", e.target.value)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    minWidth: 140,
                    padding: '0.5rem 32px 0.5rem 16px',
                    fontSize: '1rem',
                    color: '#222',
                    fontWeight: 500,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    outline: 'none',
                    marginRight: 12,
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All</option>
                  {filterOptions.channels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 18 }}>▼</span>
              </div>
            </div>
            <div className="filter-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <label className="filter-label" style={{ fontSize: '0.95rem', color: '#444', marginBottom: 6 }}>Brand</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="filter-select"
                  value={filters.brand}
                  onChange={(e) => handleFilterChange("brand", e.target.value)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    minWidth: 140,
                    padding: '0.5rem 32px 0.5rem 16px',
                    fontSize: '1rem',
                    color: '#222',
                    fontWeight: 500,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    outline: 'none',
                    marginRight: 12,
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All</option>
                  {filterOptions.brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 18 }}>▼</span>
              </div>
            </div>
            <div className="filter-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <label className="filter-label" style={{ fontSize: '0.95rem', color: '#444', marginBottom: 6 }}>Pack Type</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="filter-select"
                  value={filters.packType}
                  onChange={(e) => handleFilterChange("packType", e.target.value)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    minWidth: 140,
                    padding: '0.5rem 32px 0.5rem 16px',
                    fontSize: '1rem',
                    color: '#222',
                    fontWeight: 500,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    outline: 'none',
                    marginRight: 12,
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All</option>
                  {filterOptions.packTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 18 }}>▼</span>
              </div>
            </div>
            <div className="filter-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <label className="filter-label" style={{ fontSize: '0.95rem', color: '#444', marginBottom: 6 }}>PPG</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="filter-select"
                  value={filters.ppg}
                  onChange={(e) => handleFilterChange("ppg", e.target.value)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    minWidth: 140,
                    padding: '0.5rem 32px 0.5rem 16px',
                    fontSize: '1rem',
                    color: '#222',
                    fontWeight: 500,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    outline: 'none',
                    marginRight: 12,
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All</option>
                  {filterOptions.ppgs.map((ppg) => (
                    <option key={ppg} value={ppg}>
                      {ppg}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 18 }}>▼</span>
              </div>
            </div>
            <div className="filter-group" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <label className="filter-label" style={{ fontSize: '0.95rem', color: '#444', marginBottom: 6 }}>Year</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="filter-select"
                  value={filters.year}
                  onChange={(e) => handleFilterChange("year", e.target.value)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    minWidth: 140,
                    padding: '0.5rem 32px 0.5rem 16px',
                    fontSize: '1rem',
                    color: '#222',
                    fontWeight: 500,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    outline: 'none',
                    marginRight: 12,
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All</option>
                  {filterOptions.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999', fontSize: 18 }}>▼</span>
              </div>
            </div>
            <button className="reset-button" style={{ padding: '0.45rem 1.5rem', fontSize: '1rem', height: 40, marginTop: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#222', fontWeight: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }} onClick={resetFilters}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
              Reset
            </button>
          </div>
        </div>

        {/* Charts Container - Fixed height to fit screen */}
        <div
          className="charts-container"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            overflow: "hidden",
          }}
        >
          {/* Top Left: Sales Value (EURO) Horizontal Bar Chart */}
          <div
            className="chart-card"
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              height: 320,
            }}
          >
            <div className="chart-header" style={{ marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "600" }}>Sales Value (EURO)</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {loading ? (
                <LoadingChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData.salesValueByYear}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      tickFormatter={formatValueShort}
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis dataKey="year" type="category" axisLine={false} tickLine={false} width={40} fontSize={12} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          return (
                            <div style={{
                              background: '#222',
                              color: '#fff',
                              borderRadius: 6,
                              padding: '8px 14px',
                              fontSize: 13,
                              fontWeight: 500,
                              minWidth: 0,
                              boxShadow: 'none',
                              border: 'none',
                            }}>
                              <div style={{ marginBottom: 4 }}>{label}</div>
                              {payload.map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{
                                    display: 'inline-block',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: d.color
                                  }} />
                                  <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
                                  <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {MAIN_BRANDS.map((brand) => (
                      <Bar
                        key={brand}
                        dataKey={brand}
                        stackId="sales"
                        fill={BRAND_COLORS[brand]}
                        radius={brand === "Brand4" ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <CustomLegend
              payload={MAIN_BRANDS.map((brand) => ({
                value: brand,
                color: BRAND_COLORS[brand],
              }))}
            />
          </div>

          {/* Top Right: Volume Contribution (KG) Horizontal Bar Chart */}
          <div
            className="chart-card"
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              height: 320,
            }}
          >
            <div className="chart-header" style={{ marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "600" }}>Volume Contribution (KG)</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {loading ? (
                <LoadingChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData.volumeByYear}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      tickFormatter={formatValueShort}
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis dataKey="year" type="category" axisLine={false} tickLine={false} width={40} fontSize={12} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          return (
                            <div style={{
                              background: '#222',
                              color: '#fff',
                              borderRadius: 6,
                              padding: '8px 14px',
                              fontSize: 13,
                              fontWeight: 500,
                              minWidth: 0,
                              boxShadow: 'none',
                              border: 'none',
                            }}>
                              <div style={{ marginBottom: 4 }}>{label}</div>
                              {payload.map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{
                                    display: 'inline-block',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: d.color
                                  }} />
                                  <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
                                  <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {MAIN_BRANDS.map((brand) => (
                      <Bar
                        key={brand}
                        dataKey={brand}
                        stackId="volume"
                        fill={BRAND_COLORS[brand]}
                        radius={brand === "Brand4" ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <CustomLegend
              payload={MAIN_BRANDS.map((brand) => ({
                value: brand,
                color: BRAND_COLORS[brand],
              }))}
            />
          </div>

          {/* Bottom Left: Year-wise Sales Value Vertical Bar Chart - NO TITLE */}
          <div
            className="chart-card"
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              height: 320,
            }}
          >
            <div
              className="chart-header"
              style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "flex-end" }}
            >
              <select
                className="value-filter"
                style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, minWidth: 110, padding: '0.35rem 1.2rem', fontSize: '0.95rem', color: '#222', fontWeight: 500 }}
              >
                <option value="value">Value</option>
                <option value="volume">Volume</option>
              </select>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {loading ? (
                <LoadingChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brandComparisonData} margin={{ top: 10, right: 20, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="brand" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis tickFormatter={formatValueShort} axisLine={false} tickLine={false} fontSize={12} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          return (
                            <div style={{
                              background: '#222',
                              color: '#fff',
                              borderRadius: 6,
                              padding: '8px 14px',
                              fontSize: 13,
                              fontWeight: 500,
                              minWidth: 0,
                              boxShadow: 'none',
                              border: 'none',
                            }}>
                              <div style={{ marginBottom: 4 }}>{label}</div>
                              {payload.map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{
                                    display: 'inline-block',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: d.color
                                  }} />
                                  <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
                                  <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {years.map((year) => (
                      <Bar key={year} dataKey={year} fill={YEAR_COLORS[year]} radius={[4, 4, 0, 0]} name={year} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <CustomLegend payload={years.map((year) => ({ value: year, color: YEAR_COLORS[year] }))} />
          </div>

          {/* Bottom Right: Monthly Trend Line Chart - NO TITLE, SCROLLABLE */}
          <div
            className="chart-card"
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              height: 320,
              overflow : "hidden",
            }}
          >
            <div
              className="chart-header"
              style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "flex-end" }}
            >
              <select
                className="value-filter"
                style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, minWidth: 110, padding: '0.35rem 1.2rem', fontSize: '0.95rem', color: '#222', fontWeight: 500 }}
              >
                <option value="value">Value</option>
                <option value="volume">Volume</option>
              </select>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowX: "auto",
                overflowY: "hidden",
              }}
            >
              {loading ? (
                <LoadingChart />
              ) : (
                <div style={{ minWidth: `${chartData.monthlyTrend.length * 50}px`, height: "100%", minHeight: "200px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.monthlyTrend} margin={{ top: 10, right: 20, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                        fontSize={10}
                        tickFormatter={formatMonth}
                      />
                      <YAxis tickFormatter={formatValueShort} axisLine={false} tickLine={false} fontSize={12} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length > 0) {
                            return (
                              <div style={{
                                background: '#222',
                                color: '#fff',
                                borderRadius: 6,
                                padding: '8px 14px',
                                fontSize: 13,
                                fontWeight: 500,
                                minWidth: 0,
                                boxShadow: 'none',
                                border: 'none',
                              }}>
                                <div style={{ marginBottom: 4 }}>{label}</div>
                                {payload.map((d, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                    <span style={{
                                      display: 'inline-block',
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      background: d.color
                                    }} />
                                    <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
                                    <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={<CustomDot />}
                        activeDot={{ r: 4, fill: "#10b981" }}
                        name="Value"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Market Share Chart */}
        <div
          className="chart-card"
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            padding: '1rem',
            marginTop: '1rem',
            width: '100%',
            maxWidth: '100%',
            marginLeft: 0,
            marginRight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div className="chart-header" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Market Share ({marketShareType === 'sales' ? 'Sales Value' : 'Volume'})</h3>
            <select value={marketShareType} onChange={e => setMarketShareType(e.target.value)} style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, minWidth: 110, padding: '0.35rem 1.2rem', fontSize: '0.95rem', color: '#222', fontWeight: 500 }}>
              <option value="sales">Sales</option>
              <option value="volume">Volume</option>
            </select>
          </div>
          <div style={{ width: '100%', height: 320, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={270}>
              <PieChart margin={{ top: 40, right: 0, left: 0, bottom: 0 }}>
                <Pie
                  data={(() => {
                    // Only include brands with value > 0
                    return ['Brand1', 'Brand2', 'Brand3', 'Brand4']
                      .map((brand) => ({
                        name: brand,
                        value: marketShareType === 'sales'
                          ? marketShareData.sales_values[marketShareData.labels.indexOf(brand)]
                          : marketShareData.volume_values[marketShareData.labels.indexOf(brand)],
                      }))
                      .filter(d => d.value !== undefined && d.value !== 0 && !isNaN(d.value));
                  })()}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={85}
                  outerRadius={110}
                  fill="#8884d8"
                  labelLine={false}
                  label={({ name, value, percent, cx, cy, midAngle, innerRadius, outerRadius, ...rest }) => {
                    // Only show percentage if more than one brand is present
                    const pieData = ['Brand1', 'Brand2', 'Brand3', 'Brand4']
                      .map((brand) => ({
                        name: brand,
                        value: marketShareType === 'sales'
                          ? marketShareData.sales_values[marketShareData.labels.indexOf(brand)]
                          : marketShareData.volume_values[marketShareData.labels.indexOf(brand)],
                      }))
                      .filter(d => d.value !== undefined && d.value !== 0 && !isNaN(d.value));
                    if (pieData.length <= 1 || !value || isNaN(value)) return null;
                    const RADIAN = Math.PI / 180;
                    const radius = outerRadius + 24;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return (
                      <text
                        x={x}
                        y={y}
                        fill={BRAND_COLORS[name]}
                        textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={14}
                        fontWeight={700}
                        style={{ pointerEvents: 'none', textShadow: '0 1px 2px #fff' }}
                      >
                        {`${Math.round(percent * 100)}%`}
                      </text>
                    );
                  }}
                >
                  {(() => {
                    // Only include brands with value > 0
                    const pieData = ['Brand1', 'Brand2', 'Brand3', 'Brand4']
                      .map((brand) => ({
                        name: brand,
                        value: marketShareType === 'sales'
                          ? marketShareData.sales_values[marketShareData.labels.indexOf(brand)]
                          : marketShareData.volume_values[marketShareData.labels.indexOf(brand)],
                      }))
                      .filter(d => d.value !== undefined && d.value !== 0 && !isNaN(d.value));
                    return pieData.map((d) => (
                      <Cell key={d.name} fill={BRAND_COLORS[d.name] || "#ccc"} />
                    ));
                  })()}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const d = payload[0];
                      return (
                        <div style={{
                          background: '#222',
                          color: '#fff',
                          borderRadius: 6,
                          padding: '8px 14px',
                          fontSize: 13,
                          fontWeight: 500,
                          minWidth: 0,
                          boxShadow: 'none',
                          border: 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: d.color
                            }} />
                            <span style={{ color: d.color, fontWeight: 700 }}>{d.name}:</span>
                            <span style={{ color: '#fff', fontWeight: 500 }}>{formatValueShort(d.value)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Custom Legend below chart, now wraps and stays inside card */}
            <div className="custom-legend" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginTop: 8, width: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
              {['Brand1', 'Brand2', 'Brand3', 'Brand4'].map((brand) => (
                <div key={brand} className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: BRAND_COLORS[brand],
                    marginRight: 4,
                  }}></span>
                  <span style={{ fontSize: 14 }}>{brand}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App