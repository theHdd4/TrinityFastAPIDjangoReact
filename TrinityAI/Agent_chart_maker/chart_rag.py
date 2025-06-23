# chart_rag.py

CHART_SCHEMAS = {
    "line": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "line",
            "traces": [{
                "x_column": "",
                "y_column": "",
                "name": "",
                "style": {
                    "line": {
                        "linewidth": [],
                        "linestyle": [],
                        "marker": [],
                        "color": [],
                        "alpha": [],
                        "markersize": []
                    },
                    "annotation": {
                        "show_values": False,
                        "show_x_values": [],
                        "show_y_values": [],
                        "show_line": False,
                        "line_color": "",
                        "line_width": 1,
                        "line_dash": "",
                        "font_size": 12,
                        "font_color": "#000",
                        "arrow_color": ""
                    }
                }
            }],
            "title": {"text": "", "font_size": 14, "font_color": "#000"},
            "x_label": {"text": "", "font_size": 12, "font_color": "#000", "rotation": 0},
            "y_label": {"text": "", "font_size": 12, "font_color": "#000", "rotation": 0},
            "background": {"color": "#fff", "plot_color": "#fff"},
            "legend": {"show": True, "position": "best", "orientation": "vertical"},
            "grid": {"type": "solid"}
        }
    },
    "pie": {
        "required": ["labels_column", "values_column"],
        "template": {
            "chart_type": "pie",
            "traces": [{"labels_column": "", "values_column": "", "name": ""}],
            "style": {
                "pie": {
                    "colors": [],
                    "opacity": 1,
                    "hole": 0.0,
                    "textposition": "auto",
                    "textinfo": "percent",
                    "textfont_size": 14,
                    "textfont_color": "#000",
                    "rotation": 0,
                    "pull": [],
                    "sort": True
                }
            },
            "title": {"text": "", "font_size": 14, "font_color": "#000"},
            "legend": {"show": True, "position": "best", "orientation": "vertical"}
        }
    },
    "histogram": {
        "required": ["values_column"],
        "template": {
            "chart_type": "histogram",
            "traces": [{"values_column": "", "name": ""}],
            "style": {
                "histogram": {
                    "nbins": 10,
                    "bin_size": None,
                    "bin_start": 0.0,
                    "bin_end": 0.0,
                    "histnorm": "",
                    "cumulative": False,
                    "color": [],
                    "opacity": [],
                    "border_color": [],
                    "border_width": [],
                    "orientation": "",
                    "barmode": "",
                    "showlegend": True,
                    "textposition": "",
                    "texttemplate": None,
                    "pattern_shape": [],
                    "pattern_fgcolor": [],
                    "pattern_bgcolor": [],
                    "show_kde": True,
                    "kde_kernel": "",
                    "kde_bandwidth": None
                }
            },
            "title": {"text": "", "font_size": 14, "font_color": "#000"},
            "x_label": {"text": "", "font_size": 12, "font_color": "#000", "rotation": 0},
            "y_label": {"text": "", "font_size": 12, "font_color": "#000", "rotation": 0},
            "legend": {"show": True, "position": "best", "orientation": "vertical"},
            "grid": {"type": "solid"}
        }
    },
    "bar": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "bar",
            "traces": [{
                "x_column": "",
                "y_column": "",
                "name": "",
                "style": {
                    "bar": {
                        "color": [],
                        "opacity": [],
                        "width": None,
                        "barmode": "",
                        "orientation": "",
                        "textposition": "",
                        "textfont_size": 0,
                        "textfont_color": []
                    }
                }
            }],
            "title": {"text": "", "font_size": 0, "font_color": ""},
            "x_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "y_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "background": {"color": "", "plot_color": ""},
            "legend": {"show": True, "position": "", "orientation": ""},
            "grid": {"type": ""}
        }
    },
    "distplot": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "distplot",
            "traces": [{"x_column": "", "y_column": "", "name": ""}],
            "style": {
                "distplot": {
                    "nbins": 0,
                    "bin_size": None,
                    "bin_start": 0,
                    "bin_end": 0,
                    "histnorm": "",
                    "hist_color": "",
                    "hist_opacity": 0.0,
                    "kde_show": False,
                    "kde_color": "",
                    "kde_bandwidth": None,
                    "dist_show": False,
                    "dist_type": "",
                    "dist_color": "",
                    "dist_line_width": 0,
                    "orientation": "",
                    "showlegend": True
                }
            },
            "title": {"text": "", "font_size": 0, "font_color": ""},
            "x_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "y_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "legend": {"show": True, "position": "", "orientation": ""},
            "grid": {"type": ""}
        }
    },
    "scatter": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "scatter",
            "traces": [{
                "x_column": "",
                "y_column": "",
                "name": "",
                "style": {
                    "scatter": {
                        "show_line": False,
                        "mode": "",
                        "marker_size": 0,
                        "marker_color": "",
                        "marker_symbol": "",
                        "marker_opacity": 0.0,
                        "marker_line_color": "",
                        "marker_line_width": 0,
                        "line_color": "",
                        "line_width": 0,
                        "line_dash": "",
                        "textposition": "",
                        "textfont_size": 0,
                        "textfont_color": ""
                    }
                }
            }],
            "title": {"text": "", "font_size": 0, "font_color": ""},
            "x_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "y_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "legend": {"show": True, "position": "", "orientation": ""},
            "grid": {"type": ""}
        }
    },
    "area": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "area",
            "traces": [
                {"x_column": "", "y_column": "", "name": ""},
                {"x_column": "", "y_column": "", "name": ""}
            ],
            "style": {
                "area": {
                    "stack_mode": "",
                    "fill_opacity": 0.0,
                    "fill_pattern": None,
                    "line_color": [],
                    "line_width": [],
                    "line_dash": [],
                    "markers_show": False,
                    "markers_size": 0
                }
            },
            "title": {"text": "", "font_size": 0, "font_color": ""},
            "x_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "y_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "legend": {"show": True, "position": "", "orientation": ""},
            "grid": {"type": ""}
        }
    },
    "waterfall": {
        "required": ["x_column", "y_column"],
        "template": {
            "chart_type": "waterfall",
            "traces": [{"x_column": "", "y_column": "", "name": ""}],
            "style": {
                "waterfall": {
                    "measure": None,
                    "base": None,
                    "connector_line_color": "",
                    "connector_line_width": 0,
                    "increasing_color": "",
                    "decreasing_color": "",
                    "total_color": "",
                    "orientation": "",
                    "showlegend": True,
                    "textposition": "",
                    "textfont_size": 0,
                    "textfont_color": ""
                }
            },
            "title": {"text": "", "font_size": 0, "font_color": ""},
            "x_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "y_label": {"text": "", "font_size": 0, "font_color": "", "rotation": 0},
            "legend": {"show": True, "position": "", "orientation": ""},
            "grid": {"type": ""}
        }
    }
}

def get_chart_schema(chart_type):
    return CHART_SCHEMAS.get(chart_type, CHART_SCHEMAS["line"])

def validate_extracted_properties(chart_type, extracted):
    required = get_chart_schema(chart_type)["required"]
    traces = extracted.get("traces", [{}])
    trace = traces[0] if traces else {}
    missing = [field for field in required if not trace.get(field)]
    return missing

def fill_defaults(template, extracted):
    """
    Recursively fills missing fields with 'default' (except required fields, which are validated separately).
    """
    def _fill(t, e):
        if isinstance(t, dict):
            result = {}
            for k, v in t.items():
                if k in e and e[k] not in ("", [], None):
                    result[k] = _fill(v, e[k])
                else:
                    result[k] = _fill(v, {}) if isinstance(v, (dict, list)) else "default"
            return result
        elif isinstance(t, list):
            if isinstance(e, list) and e:
                return [_fill(t[0], item) for item in e]
            elif t:
                return [_fill(t[0], {})]
            else:
                return []
        else:
            return e if e not in ("", [], None) else "default"
    return _fill(template, extracted)
