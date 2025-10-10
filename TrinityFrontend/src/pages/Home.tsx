import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Brain, 
  BarChart3, 
  Database, 
  TrendingUp, 
  FileSpreadsheet, 
  Plug,
  Play,
  Zap,
  CheckCircle,
  ArrowRight,
  Sparkles,
  ArrowUp,
  LineChart
} from 'lucide-react';
import AnimatedLogo from '@/components/PrimaryMenu/TrinityAssets/AnimatedLogo';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const Home = () => {
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const heroSlides = [
    {
      title: "Marketing Mix Modeling",
      color: "from-primary/20 to-primary/5",
      icon: TrendingUp,
      description: "Optimize marketing spend across channels",
      data: [
        { label: "Social Media", value: 35, color: "primary" },
        { label: "Email Marketing", value: 40, color: "secondary" },
        { label: "Content Marketing", value: 25, color: "accent" }
      ]
    },
    {
      title: "Forecasting Analysis",
      color: "from-purple-200/20 to-purple-100/5",
      icon: LineChart,
      description: "Predict future trends with confidence",
      data: [
        { label: "Q1 Actual", value: 88, color: "secondary" },
        { label: "Q2 Forecast", value: 92, color: "accent" },
        { label: "Q3 Projection", value: 95, color: "primary" }
      ]
    },
    {
      title: "Promo Effectiveness",
      color: "from-secondary/20 to-secondary/5",
      icon: BarChart3,
      description: "Measure promotional campaign impact",
      data: [
        { label: "Campaign ROI", value: 78, color: "accent" },
        { label: "Engagement Rate", value: 82, color: "primary" },
        { label: "Conversion", value: 65, color: "secondary" }
      ]
    },
    {
      title: "Price Ladder",
      color: "from-purple-200/20 to-purple-100/5",
      icon: Database,
      description: "Find optimal pricing strategies",
      data: [
        { label: "Price Elasticity", value: 91, color: "primary" },
        { label: "Margin Impact", value: 76, color: "secondary" },
        { label: "Demand Curve", value: 84, color: "accent" }
      ]
    }
  ];

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);

    return () => clearInterval(slideInterval);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const features = [
    {
      icon: Plug,
      title: "AI-Guided Intelligence",
      description: "State your question — Trinity AI creates and runs the analysis automatically."
    }
    ,
    {
      icon: BarChart3,
      title: "Insights to slides - in a few clicks. ",
      description: "Save hours of manual work — share your findings instantly with clear, impactful slides."
    },
    {
      icon: Brain,
      title: "Machine Learning Simplified",
      description: "Run modeling pipelines in seconds — regression, classification, clustering & more."
    }
    ,
    {
      icon: TrendingUp,
      title: "Forecast with Confidence",
      description: "Use ML and time series models to forecast any metric."
    },
    {
      icon: FileSpreadsheet,
      title: "Prebuilt Templates",
      description: "Use ready-to-run workflows for churn, pricing, sales, and more."
    },
    {
      icon: Database,
      title: "DataFrame Operations Made Easy",
      description: "Merge, filter, groupby — all done via intuitive UI blocks."
    }
  ];

  const faqs = [
    {
      question: "What is Trinity?",
      answer: "Trinity is an AI-powered decision intelligence platform that helps business managers analyze data, forecast outcomes, and make smarter decisions — without needing coding or data science expertise. It combines predictive modeling, causal analysis, and storytelling tools in one intuitive workspace."
    },
    {
      question: "Who is Trinity designed for?",
      answer: "Trinity is built for business managers, category heads, and decision-makers who currently rely on Excel or analysts to interpret data. It gives them direct, transparent control over how insights are generated."
    },
    {
      question: "How is Trinity different from other analytics or AI tools?",
      answer: "Trinity comes pre-loaded with many pre-built templates for different tasks. So, you just need to upload your data and with a few clicks see the results. It is also powered with Agentic AI to create custom workflows. It blends the simplicity of no-code tools with the power of enterprise-grade analytics."
    },
    {
      question: "What types of problems can I solve with Trinity?",
      answer: "You can use Trinity for a wide range of analytical tasks, including: Price Elasticity Modeling, Promotion Planning, Marketing Mix Modeling (MMM), Media Planning, Forecasting and Scenario Planning, Innovation and Assortment Planning. The list of pre-built analysis continues to grow. And you can even create your own custom analyses using reusable workflows."
    },
    {
      question: "Do I need to know coding or statistics to use Trinity?",
      answer: "No. Trinity's guided workflows and drag-and-drop Atoms let you analyze data and interpret insights without writing a single line of code."
    },
    {
      question: "How does Trinity ensure accuracy and transparency?",
      answer: "Every model and output is fully explainable and traceable. You can see which variables drive outcomes and why — helping you trust every insight you act on."
    },
    {
      question: "What does \"Agentic AI\" mean in Trinity?",
      answer: "Agentic AI is Trinity's built-in intelligence layer that helps you define your business problem, select variables, and automatically build the right model. It turns analytical intent into executable workflows in seconds."
    },
    {
      question: "Can Trinity work with my company's data?",
      answer: "Yes. Trinity integrates easily with spreadsheets at this time. Enterprise data linkage is on the cards. You can also use preloaded sample datasets to explore analyses before connecting your own."
    },
    {
      question: "Is Trinity available on-premise?",
      answer: "Soon. For enterprises requiring enhanced data security, Trinity will offer on-premise deployment — providing the same flexibility as the SaaS version while keeping all data within your organization."
    },
    {
      question: "What does pricing look like?",
      answer: "Trinity offers two flexible models: SaaS Model for small and mid-sized businesses (per-user licensing) and On-Premise Model for enterprises (custom license bundles with private hosting and support)."
    },
    {
      question: "How can I get early access?",
      answer: "You can join the Trinity Beta Program to experience early features, share feedback, and co-create new capabilities with our team."
    }
  ];

  return (
    <>
      <style>{`
        @keyframes barPulse {
          0%, 100% {
            transform: scaleX(1);
            opacity: 1;
          }
          50% {
            transform: scaleX(1.05);
            opacity: 0.9;
          }
        }
      `}</style>
      <div 
        className="min-h-screen bg-white relative"
        style={{
          // Custom color scheme for Home page only
          '--primary': '42 100% 68%',           // Golden yellow
          '--primary-foreground': '0 0% 20%',
          '--secondary': '151 50% 51%',         // Green
          '--secondary-foreground': '0 0% 100%',
          '--accent': '213 71% 58%',            // Blue
          '--accent-foreground': '0 0% 100%',
          '--foreground': '0 0% 20%',
          '--muted': '0 0% 96%',
          '--muted-foreground': '0 0% 40%',
          '--border': '0 0% 90%',
        } as React.CSSProperties}
      >
      {/* Header/Navigation */}
      <header className="border-b border-border/50 bg-white sticky top-0 z-50">
        <div className="w-full px-6 lg:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => scrollToTop()}>
            <AnimatedLogo className="w-10 h-10 transition-transform group-hover:scale-105" />
            <h1 className="text-xl font-bold text-foreground">Trinity</h1>
          </div>
          
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-foreground/70 hover:text-foreground font-medium transition-colors">Features</a>
            <a href="#demo" className="text-foreground/70 hover:text-foreground font-medium transition-colors">Demo</a>
            <a href="#faq" className="text-foreground/70 hover:text-foreground font-medium transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button 
              variant="ghost"
              onClick={() => navigate('/login')} 
               className="text-foreground hover:text-foreground hover:bg-white font-medium"
            >
              Log in
            </Button>
            <Button 
               onClick={() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' })} 
              className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg px-6"
            >
              Sign up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full py-16 md:py-20 bg-gradient-to-br from-white via-primary/5 to-secondary/5 relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 opacity-70">
          {/* Grid Pattern */}
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: `
                linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px),
                linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px'
            }}
          />
          
          {/* Flowing Highlight Through Grid */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                <stop offset="20%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                <stop offset="40%" stopColor="hsl(var(--secondary))" stopOpacity="1" />
                <stop offset="60%" stopColor="hsl(var(--accent))" stopOpacity="1" />
                <stop offset="80%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="0" />
              </linearGradient>
              
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Continuous Progressively Drawing Sinusoidal Waves */}
            <path
              d="M -20 35 C -10 25, 0 25, 10 35 C 20 45, 30 45, 40 35 C 50 25, 60 25, 70 35 C 80 45, 90 45, 100 35 C 110 25, 120 25, 130 35"
              stroke="url(#flowGradient)"
              strokeWidth="0.4"
              fill="none"
              filter="url(#glow)"
              vectorEffect="non-scaling-stroke"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-150 0"
                to="150 0"
                dur="6s"
                repeatCount="indefinite"
              />
            </path>
            {/* Second wave offset by 2 seconds */}
            <path
              d="M -20 35 C -10 25, 0 25, 10 35 C 20 45, 30 45, 40 35 C 50 25, 60 25, 70 35 C 80 45, 90 45, 100 35 C 110 25, 120 25, 130 35"
              stroke="url(#flowGradient)"
              strokeWidth="0.4"
              fill="none"
              filter="url(#glow)"
              vectorEffect="non-scaling-stroke"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-150 0"
                to="150 0"
                dur="6s"
                begin="2s"
                repeatCount="indefinite"
              />
            </path>
            {/* Third wave offset by 4 seconds */}
            <path
              d="M -20 35 C -10 25, 0 25, 10 35 C 20 45, 30 45, 40 35 C 50 25, 60 25, 70 35 C 80 45, 90 45, 100 35 C 110 25, 120 25, 130 35"
              stroke="url(#flowGradient)"
              strokeWidth="0.4"
              fill="none"
              filter="url(#glow)"
              vectorEffect="non-scaling-stroke"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="-150 0"
                to="150 0"
                dur="6s"
                begin="4s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>
        
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl"></div>
        
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Side - Content */}
            <div className="space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border-2 border-primary/20 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">AI Powered Analytics Platform</span>
              </div>
              
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-foreground leading-[1.1]">
                Business decisions made{' '}
                <span className="relative inline-block">
                  <span className="text-primary">smarter</span>
                  <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 12" fill="none">
                    <path d="M2 10C50 5 150 5 198 10" stroke="currentColor" strokeWidth="3" className="text-primary/30"/>
                  </svg>
                </span>
                ,{' '}
                <span className="relative inline-block">
                  <span className="text-secondary">faster</span>
                  <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 12" fill="none">
                    <path d="M2 10C50 5 150 5 198 10" stroke="currentColor" strokeWidth="3" className="text-secondary/30"/>
                  </svg>
                </span>
                {' '}and{' '}
                <span className="relative inline-block">
                  <span className="text-accent">simpler</span>
                  <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 12" fill="none">
                    <path d="M2 10C50 5 150 5 198 10" stroke="currentColor" strokeWidth="3" className="text-accent/30"/>
                  </svg>
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Uncover insights, forecast outcomes, and test scenarios — all in minutes, not months. Step beyond spreadsheets into an AI-driven era of decision-making.
              </p>
              
              <div className="flex flex-wrap gap-4 pt-4">
                <Button 
                  size="lg" 
                  className="text-base px-8 py-6 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
                  onClick={() => navigate('/login')}
                >
                  Access Trinity
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-base px-8 py-6 border-2 border-border hover:border-primary hover:bg-primary/5 text-foreground hover:text-foreground font-semibold rounded-xl transition-all duration-300"
                  onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <Play className="mr-2 w-5 h-5" />
                  See it in action
                </Button>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-8 pt-6">
                <div className="group cursor-default">
                  <div className="text-2xl font-bold text-primary group-hover:scale-110 transition-transform">20+</div>
                  <div className="text-xs text-muted-foreground">Reusable Workflow built</div>
                </div>
                <div className="group cursor-default">
                  <div className="text-2xl font-bold text-secondary group-hover:scale-110 transition-transform">50M+</div>
                  <div className="text-xs text-muted-foreground">Rows analyzed</div>
                </div>
                <div className="group cursor-default">
                  <div className="text-2xl font-bold text-accent group-hover:scale-110 transition-transform">99.9%</div>
                  <div className="text-xs text-muted-foreground">Uptime</div>
                </div>
              </div>
            </div>

            {/* Right Side - Interactive Slideshow */}
            <div className="relative h-[550px] overflow-hidden">
              <div 
                className="absolute w-full transition-transform duration-1000 ease-in-out"
                style={{ 
                  transform: `translateY(${140 - (currentSlide * 290)}px)`,
                }}
              >
                {[...heroSlides, ...heroSlides].map((slide, index) => {
                  const isActive = index % heroSlides.length === currentSlide;
                  const slideIndex = index % heroSlides.length;
                  
                  return (
                    <div
                      key={index}
                      className={`mb-5 transition-all duration-500 ${isActive ? 'scale-98 opacity-100 z-10' : 'scale-95 opacity-90'}`}
                    >
                      <Card className={`overflow-hidden border-2 transition-all duration-300 bg-gradient-to-br ${slide.color} group cursor-pointer ${isActive ? 'border-primary/50 hover:border-primary shadow-2xl' : 'border-border/40 shadow-md'}`}>
                        <div className="p-6 h-[270px] flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                                  <slide.icon className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{slide.title}</h3>
                                  <p className="text-xs text-muted-foreground">{slide.description}</p>
                                </div>
                              </div>
                              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                            </div>
                            
                            {/* Conditional Visualization Based on Slide */}
                            <div className="mt-4">
                              {slideIndex === 0 && (
                                // Marketing Mix - Bar Chart with Animated Bars
                                <div className="space-y-3 mt-4">
                                  {slide.data?.map((item, idx) => (
                                    <div key={idx} className="space-y-1">
                              <div className="flex items-center gap-3 group/bar">
                                        <div className="flex-1 h-6 bg-white/50 rounded-lg overflow-hidden">
                                          <div
                                            className={`h-full rounded-lg group-hover/bar:scale-x-105 transition-all duration-300 origin-left shadow-sm ${
                                              item.color === 'primary' ? 'bg-primary' :
                                              item.color === 'secondary' ? 'bg-secondary' :
                                              'bg-accent'
                                            }`}
                                            style={{ 
                                              width: `${item.value}%`,
                                              animation: `barPulse 2s ease-in-out infinite`,
                                              animationDelay: `${idx * 0.3}s`
                                            }}
                                          ></div>
                                </div>
                                        <span className="text-xs font-bold text-foreground">{item.value}%</span>
                              </div>
                                </div>
                                  ))}
                              </div>
                              )}
                              
                              {slideIndex === 1 && (
                                // Forecasting - Historic & Forecast Line Graph
                                <div className="relative h-32 flex items-center justify-center overflow-hidden px-4">
                                  <svg className="w-full h-full" viewBox="0 0 240 100" preserveAspectRatio="xMidYMid meet">
                                    <defs>
                                      <linearGradient id="historicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                                        <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="1" />
                                      </linearGradient>
                                      <linearGradient id="forecastGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.7" />
                                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.9" />
                                      </linearGradient>
                                      <linearGradient id="historicAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                                      </linearGradient>
                                      <linearGradient id="forecastAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.2" />
                                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                                      </linearGradient>
                                      <filter id="glow">
                                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                                        <feMerge>
                                          <feMergeNode in="coloredBlur"/>
                                          <feMergeNode in="SourceGraphic"/>
                                        </feMerge>
                                      </filter>
                                    </defs>
                                    
                                    {/* Grid lines */}
                                    {[25, 50, 75].map((y) => (
                                      <line
                                        key={y}
                                        x1="20"
                                        y1={y}
                                        x2="220"
                                        y2={y}
                                        stroke="hsl(var(--border))"
                                        strokeWidth="0.5"
                                        strokeDasharray="3,3"
                                        opacity="0.3"
                                      />
                                    ))}
                                    
                                    {/* Vertical separator line at forecast boundary */}
                                    <line
                                      x1="140"
                                      y1="20"
                                      x2="140"
                                      y2="95"
                                      stroke="hsl(var(--border))"
                                      strokeWidth="1.5"
                                      strokeDasharray="5,5"
                                      opacity="0.4"
                                    />
                                    
                                    {/* Historic area fill */}
                                    <path
                                      d="M 20 75 Q 50 70, 80 62 Q 110 52, 140 45 L 140 95 L 20 95 Z"
                                      fill="url(#historicAreaGradient)"
                                    >
                                      <animate
                                        attributeName="d"
                                        values="M 20 75 Q 50 70, 80 62 Q 110 52, 140 45 L 140 95 L 20 95 Z;
                                                M 20 75 Q 50 68, 80 60 Q 110 50, 140 43 L 140 95 L 20 95 Z;
                                                M 20 75 Q 50 70, 80 62 Q 110 52, 140 45 L 140 95 L 20 95 Z"
                                        dur="3s"
                                        repeatCount="indefinite"
                                      />
                                    </path>
                                    
                                    {/* Forecast area fill */}
                                    <path
                                      d="M 140 45 Q 170 35, 200 25 Q 210 22, 220 18 L 220 95 L 140 95 Z"
                                      fill="url(#forecastAreaGradient)"
                                      opacity="0.6"
                                    >
                                      <animate
                                        attributeName="d"
                                        values="M 140 45 Q 170 35, 200 25 Q 210 22, 220 18 L 220 95 L 140 95 Z;
                                                M 140 43 Q 170 32, 200 22 Q 210 19, 220 15 L 220 95 L 140 95 Z;
                                                M 140 45 Q 170 35, 200 25 Q 210 22, 220 18 L 220 95 L 140 95 Z"
                                        dur="3s"
                                        repeatCount="indefinite"
                                      />
                                    </path>
                                    
                                    {/* Historic solid line */}
                                    <path
                                      d="M 20 75 Q 50 70, 80 62 Q 110 52, 140 45"
                                      fill="none"
                                      stroke="url(#historicGradient)"
                                      strokeWidth="3.5"
                                      strokeLinecap="round"
                                      filter="url(#glow)"
                                    >
                                      <animate
                                        attributeName="d"
                                        values="M 20 75 Q 50 70, 80 62 Q 110 52, 140 45;
                                                M 20 75 Q 50 68, 80 60 Q 110 50, 140 43;
                                                M 20 75 Q 50 70, 80 62 Q 110 52, 140 45"
                                        dur="3s"
                                        repeatCount="indefinite"
                                      />
                                    </path>
                                    
                                    {/* Forecast dashed line */}
                                    <path
                                      d="M 140 45 Q 170 35, 200 25 Q 210 22, 220 18"
                                      fill="none"
                                      stroke="url(#forecastGradient)"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeDasharray="6,4"
                                      opacity="0.8"
                                    >
                                      <animate
                                        attributeName="d"
                                        values="M 140 45 Q 170 35, 200 25 Q 210 22, 220 18;
                                                M 140 43 Q 170 32, 200 22 Q 210 19, 220 15;
                                                M 140 45 Q 170 35, 200 25 Q 210 22, 220 18"
                                        dur="3s"
                                        repeatCount="indefinite"
                                      />
                                    </path>
                                    
                                    {/* Historic data points */}
                                    {[
                                      { x: 20, y: 75, delay: 0 },
                                      { x: 50, y: 70, delay: 0.3 },
                                      { x: 80, y: 62, delay: 0.6 },
                                      { x: 110, y: 52, delay: 0.9 },
                                      { x: 140, y: 45, delay: 1.2 }
                                    ].map((point, i) => (
                                      <g key={i}>
                                        <circle
                                          cx={point.x}
                                          cy={point.y}
                                          r="8"
                                          fill="none"
                                          stroke="hsl(var(--primary))"
                                          strokeWidth="1"
                                          opacity="0"
                                        >
                                          <animate
                                            attributeName="opacity"
                                            values="0;0.4;0"
                                            dur="3s"
                                            begin={`${point.delay}s`}
                                            repeatCount="indefinite"
                                          />
                                          <animate
                                            attributeName="r"
                                            values="4;10;4"
                                            dur="3s"
                                            begin={`${point.delay}s`}
                                            repeatCount="indefinite"
                                          />
                                        </circle>
                                        <circle
                                          cx={point.x}
                                          cy={point.y}
                                          r="3"
                                          fill="hsl(var(--primary))"
                                          stroke="hsl(var(--background))"
                                          strokeWidth="1.5"
                                        />
                                      </g>
                                    ))}
                                    
                                    {/* Forecast data points */}
                                    {[
                                      { x: 170, y: 35, delay: 1.5 },
                                      { x: 200, y: 25, delay: 1.8 },
                                      { x: 220, y: 18, delay: 2.1 }
                                    ].map((point, i) => (
                                      <g key={`forecast-${i}`}>
                                        <circle
                                          cx={point.x}
                                          cy={point.y}
                                          r="8"
                                          fill="none"
                                          stroke="hsl(var(--accent))"
                                          strokeWidth="1"
                                          opacity="0"
                                        >
                                          <animate
                                            attributeName="opacity"
                                            values="0;0.3;0"
                                            dur="3s"
                                            begin={`${point.delay}s`}
                                            repeatCount="indefinite"
                                          />
                                          <animate
                                            attributeName="r"
                                            values="4;10;4"
                                            dur="3s"
                                            begin={`${point.delay}s`}
                                            repeatCount="indefinite"
                                          />
                                        </circle>
                                        <circle
                                          cx={point.x}
                                          cy={point.y}
                                          r="2.5"
                                          fill="hsl(var(--accent))"
                                          stroke="hsl(var(--background))"
                                          strokeWidth="1.5"
                                          opacity="0.8"
                                        />
                                      </g>
                                    ))}
                                    
                                    {/* Labels */}
                                    <text
                                      x="70"
                                      y="12"
                                      fontSize="9"
                                      fontWeight="600"
                                      fill="hsl(var(--primary))"
                                    >
                                      Historic
                                    </text>
                                    <text
                                      x="165"
                                      y="12"
                                      fontSize="9"
                                      fontWeight="600"
                                      fill="hsl(var(--accent))"
                                    >
                                      Forecast
                                    </text>
                                  </svg>
                                  
                                  {/* Trend indicator */}
                                  <div className="absolute top-2 right-4 flex items-center gap-1 bg-accent/10 backdrop-blur-sm px-2 py-1 rounded-full border border-accent/20">
                                    <ArrowUp className="w-3 h-3 text-accent animate-bounce" style={{ animationDuration: '2s' }} />
                                    <span className="text-[10px] font-bold text-accent">+32%</span>
                                </div>
                              </div>
                              )}
                              
                              {slideIndex === 2 && (
                                // Promo Effectiveness - Dynamic Balance Scale (from Price Optimization)
                                <div className="relative h-32 flex items-center justify-center">
                                  <div className="relative w-48 h-full flex flex-col items-center justify-center">
                                    {/* Balance beam */}
                                    <div className="relative w-full h-1 bg-gradient-to-r from-primary via-accent to-secondary rounded-full shadow-lg">
                                      <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse" />
                                    </div>
                                    
                                    {/* Center pivot */}
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-gradient-to-b from-foreground to-foreground/60 rounded-full" />
                                    
                                    {/* Left weight - Value */}
                                    <div className="absolute left-4 top-1/2 -translate-y-20 flex flex-col items-center gap-2">
                                      <div className="text-xs font-bold text-primary mb-2">Impact</div>
                                      <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/60 rounded-lg shadow-xl animate-bounce flex items-center justify-center" style={{ animationDuration: '2s' }}>
                                        <TrendingUp className="w-6 h-6 text-white" />
                                      </div>
                                      <div className="w-0.5 h-8 bg-primary/50" />
                                    </div>
                                    
                                    {/* Right weight - Cost */}
                                    <div className="absolute right-4 top-1/2 -translate-y-20 flex flex-col items-center gap-2">
                                      <div className="text-xs font-bold text-secondary mb-2">Cost</div>
                                      <div className="w-12 h-12 bg-gradient-to-br from-secondary to-secondary/60 rounded-lg shadow-xl animate-bounce flex items-center justify-center" style={{ animationDuration: '2s', animationDelay: '1s' }}>
                                        <Database className="w-6 h-6 text-white" />
                                      </div>
                                      <div className="w-0.5 h-8 bg-secondary/50" />
                                    </div>
                                    
                                    {/* Optimal point indicator */}
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                                      <div className="w-3 h-3 bg-accent rounded-full animate-ping" />
                                      <div className="text-xs font-bold text-accent">ROI</div>
                                    </div>
                                    
                                    {/* Floating sparkles */}
                                    {[...Array(6)].map((_, i) => (
                                      <div
                                        key={i}
                                        className="absolute w-1 h-1 bg-accent/50 rounded-full animate-ping"
                                        style={{
                                          top: `${20 + Math.random() * 60}%`,
                                          left: `${10 + Math.random() * 80}%`,
                                          animationDuration: `${2 + i * 0.3}s`,
                                          animationDelay: `${i * 0.4}s`
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {slideIndex === 3 && (
                                // Price Ladder - Ladder Visualization with Growth Metrics
                                <div className="relative h-32 flex items-center justify-center">
                                  <div className="relative w-full h-full flex items-center justify-center px-4">
                                    {/* Ladder structure */}
                                    <div className="relative w-40 h-28">
                                      {/* Vertical rails */}
                                      <div className="absolute left-2 top-0 w-1 h-full bg-gradient-to-b from-primary to-primary/40 rounded-full" />
                                      <div className="absolute right-2 top-0 w-1 h-full bg-gradient-to-b from-primary to-primary/40 rounded-full" />
                                      
                                      {/* Ladder rungs with metrics */}
                                      {[
                                        { price: '$10', sales: '100K', volume: '10K', delay: '0s', bottom: '0%' },
                                        { price: '$15', sales: '180K', volume: '12K', delay: '0.3s', bottom: '33%' },
                                        { price: '$20', sales: '300K', volume: '15K', delay: '0.6s', bottom: '66%' }
                                      ].map((rung, idx) => (
                                        <div 
                                          key={idx}
                                          className="absolute w-full flex items-center justify-between px-2"
                                          style={{ 
                                            bottom: rung.bottom,
                                            animation: `fade-in 0.5s ease-out ${rung.delay} both`
                                          }}
                                        >
                                          {/* Rung bar */}
                                          <div className="absolute inset-x-2 h-1 bg-gradient-to-r from-secondary via-accent to-secondary rounded-full shadow-md" />
                                          
                                          {/* Left side - Price & Sales */}
                                          <div className="relative -left-16 flex flex-col items-end text-[10px] font-bold">
                                            <div className="text-primary">{rung.price}</div>
                                            <div className="text-secondary">{rung.sales}</div>
                                          </div>
                                          
                                          {/* Right side - Volume */}
                                          <div className="relative -right-16 flex flex-col items-start text-[10px] font-bold">
                                            <div className="text-accent">{rung.volume}</div>
                                          </div>
                                          
                                          {/* Growth arrow */}
                                          {idx < 2 && (
                                            <ArrowUp 
                                              className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 text-primary animate-bounce" 
                                              style={{ 
                                                animationDuration: '1.5s',
                                                animationDelay: `${idx * 0.3}s`
                                              }}
                                            />
                                          )}
                                        </div>
                                      ))}
                                      
                                      {/* Climbing indicator */}
                                      <div 
                                        className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-gradient-to-br from-accent to-accent/60 rounded-full shadow-lg"
                                        style={{
                                          animation: 'climb 3s ease-in-out infinite',
                                        }}
                                      />
                                    </div>
                                    
                                    {/* Labels */}
                                    <div className="absolute -bottom-2 left-4 text-[9px] font-bold text-primary">Sales →</div>
                                    <div className="absolute -bottom-2 right-4 text-[9px] font-bold text-accent">Volume →</div>
                                    
                                    {/* Success sparkles */}
                                    {[...Array(8)].map((_, i) => (
                                      <div
                                        key={i}
                                        className="absolute w-1 h-1 bg-primary/40 rounded-full animate-ping"
                                        style={{
                                          top: `${10 + i * 12}%`,
                                          left: `${5 + i * 12}%`,
                                          animationDuration: `${2 + i * 0.2}s`,
                                          animationDelay: `${i * 0.3}s`
                                        }}
                                      />
                                    ))}
                                  </div>
                                  
                                  {/* Add climbing animation keyframe inline */}
                                  <style>{`
                                    @keyframes climb {
                                      0%, 100% { bottom: 0%; opacity: 0.6; }
                                      50% { bottom: 70%; opacity: 1; }
                                    }
                                  `}</style>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-4 border-t-2 border-white/30">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
                              <span className="text-xs font-medium text-foreground/80">Live insights</span>
                            </div>
                            <CheckCircle className="w-5 h-5 text-secondary" />
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>

              {/* Enhanced Gradient Overlays */}
              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-10"></div>
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-10"></div>
            </div>
          </div>
        </div>
      </section>


      {/* Value Proposition Section */}
      <section className="w-full bg-gradient-to-b from-muted to-white py-24">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
              Data science for <span className="text-primary">everyone</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-4xl mx-auto">
              Trinity breaks down technical barriers, empowering business managers with enterprise-grade data science through an intuitive visual interface.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-10 rounded-3xl border-2 border-border hover:border-primary transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all shadow-lg">
                  <CheckCircle className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-4 group-hover:text-primary transition-colors">No code required</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">Build complex models, run analyses, and generate insights without writing a single line of code.</p>
              </div>
            </div>

            <div className="bg-white p-10 rounded-3xl border-2 border-border hover:border-secondary transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary/60 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all shadow-lg">
                  <Zap className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-4 group-hover:text-secondary transition-colors">Instant results</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">Get production-ready models and forecasts in minutes instead of weeks of development.</p>
              </div>
            </div>

            <div className="bg-white p-10 rounded-3xl border-2 border-border hover:border-accent transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-gradient-to-br from-accent to-accent/60 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all shadow-lg">
                  <Brain className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-4 group-hover:text-accent transition-colors">Collective Intelligence Unlocked</h3>
                <p className="text-muted-foreground text-lg leading-relaxed">Share and leverage best practices for smarter decisions systems.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      {/* <section className="w-full py-24 bg-gradient-to-b from-white to-muted/30">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-6">
              <span className="text-sm font-bold text-primary uppercase tracking-wider">For Business Managers</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
              Take control of your <span className="text-primary">decisions</span>
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Business Managers who want higher degree of control on own decisions
            </p>
          </div> */}
      {/* Key Benefits Section */}
      <section className="w-full py-24 bg-white relative overflow-hidden">
        {/* Static Triangular Grid Background */}
        <div className="absolute inset-0 opacity-70">
          {/* Triangular Grid Pattern */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="triangleGrid" x="0" y="0" width="3" height="2.6" patternUnits="userSpaceOnUse">
                {/* Small triangle outlines */}
                <path d="M 0 2.6 L 1.5 0 L 3 2.6 Z" 
                      stroke="hsl(var(--primary) / 0.2)" 
                      strokeWidth="0.08" 
                      fill="none" />
              </pattern>
            </defs>
            
            {/* Apply triangular grid */}
            <rect width="100" height="100" fill="url(#triangleGrid)" />
          </svg>
        </div>
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12 relative z-10">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-6">
              <span className="text-sm font-bold text-primary uppercase tracking-wider">For Business Managers</span>
            </div>
             <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
               360° analytics for your <span className="text-primary">decisions</span>
             </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Trinity brings the analytics you need together - ready when you are
            </p>
          </div>

          <div className="space-y-32">
            {/* Benefit 1 - Visualization Left, Text Right */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl transform group-hover:scale-105 transition-transform duration-500"></div>
                <div className="relative bg-white rounded-3xl border-2 border-primary/20 p-12 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  {/* Animated Background Pattern */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <div className="absolute top-0 left-0 w-full h-full">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute bg-primary rounded-full"
                          style={{
                            width: `${100 + i * 40}px`,
                            height: `${100 + i * 40}px`,
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            animation: `pulse ${2 + i * 0.5}s ease-in-out infinite`,
                            animationDelay: `${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-8 relative z-10">
                    <div className="flex items-center gap-4 animate-fade-in">
                      <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center animate-bounce">
                        <CheckCircle className="w-9 h-9 text-white" />
                      </div>
                      <div className="text-6xl font-black text-primary animate-[scale-in_0.8s_ease-out] hover:scale-110 transition-transform duration-300">80%</div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl hover:bg-primary/5 transition-all group/item animate-[fade-in_0.6s_ease-out] hover:scale-105">
                        <span className="font-semibold text-foreground">Data Scientists</span>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-32 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-[scale-in_1s_ease-out] origin-left group-hover/item:animate-pulse" style={{ width: '20%' }}></div>
                          </div>
                          <span className="text-sm font-bold text-primary animate-[fade-in_1.2s_ease-out]">20%</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl hover:bg-primary/5 transition-all group/item animate-[fade-in_0.9s_ease-out] hover:scale-105">
                        <span className="font-semibold text-foreground">Consultants</span>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-32 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-[scale-in_1.2s_ease-out] origin-left group-hover/item:animate-pulse" style={{ width: '15%' }}></div>
                          </div>
                          <span className="text-sm font-bold text-primary animate-[fade-in_1.5s_ease-out]">15%</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border-2 border-primary/20 animate-[fade-in_1.2s_ease-out] hover:scale-105 transition-transform">
                        <span className="font-bold text-primary">You in Control</span>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-32 bg-primary/20 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-[scale-in_1.4s_ease-out] origin-left" style={{ width: '100%' }}></div>
                          </div>
                          <CheckCircle className="w-5 h-5 text-primary animate-pulse" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      <span>Decision intelligence in your hands</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 animate-fade-in">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  Reduces dependency on data scientists or consultants by up to <span className="text-primary">80%</span>
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Putting decision intelligence directly into the hands of business teams. No more waiting weeks for external resources—make data-driven decisions instantly.
                </p>
              </div>
            </div>

            {/* Benefit 2 - Text Left, Visualization Right */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6 animate-fade-in">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  Reduces time to insights from <span className="text-secondary">months to hours</span>
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Enabling 10× faster turnaround for questions on pricing, forecasting, marketing analysis and so on. Transform your decision-making speed.
                </p>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-secondary/5 rounded-3xl transform group-hover:scale-105 transition-transform duration-500"></div>
                <div className="relative bg-white rounded-3xl border-2 border-secondary/20 p-12 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  {/* Animated Speed Lines */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {[...Array(8)].map((_, i) => (
                        <line
                          key={i}
                          x1="0"
                          y1={10 + i * 12}
                          x2="100"
                          y2={10 + i * 12}
                          stroke="currentColor"
                          strokeWidth="0.5"
                          className="text-secondary"
                          strokeDasharray="10 5"
                        >
                          <animate
                            attributeName="stroke-dashoffset"
                            from="0"
                            to="30"
                            dur={`${1 + i * 0.2}s`}
                            repeatCount="indefinite"
                          />
                        </line>
                      ))}
                    </svg>
                  </div>
                  
                  <div className="space-y-8 relative z-10">
                    <div className="flex items-center justify-between animate-[fade-in_0.5s_ease-out]">
                      <div className="animate-[fade-in_0.8s_ease-out]">
                        <div className="text-sm font-semibold text-muted-foreground mb-2">Traditional Approach</div>
                        <div className="text-4xl font-black text-muted-foreground/50 hover:scale-110 transition-transform duration-300">3-6 months</div>
                      </div>
                      <ArrowRight className="w-8 h-8 text-secondary animate-[pulse_1.5s_ease-in-out_infinite]" />
                    </div>

                    <div className="relative py-6">
                      <div className="absolute top-1/2 left-0 right-0 h-1 bg-muted overflow-hidden">
                        <div className="h-full w-full bg-secondary/30 animate-[slide-in-right_2s_ease-in-out_infinite]"></div>
                      </div>
                      <div className="relative flex justify-between">
                        <div className="w-3 h-3 bg-muted rounded-full animate-[scale-in_0.5s_ease-out]"></div>
                        <div className="w-3 h-3 bg-muted rounded-full animate-[scale-in_0.7s_ease-out]"></div>
                        <div className="w-3 h-3 bg-muted rounded-full animate-[scale-in_0.9s_ease-out]"></div>
                        <div className="w-3 h-3 bg-muted rounded-full animate-[scale-in_1.1s_ease-out]"></div>
                        <div className="w-3 h-3 bg-secondary rounded-full animate-[pulse_1s_ease-in-out_infinite] shadow-lg shadow-secondary/50"></div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-secondary to-accent p-6 rounded-2xl text-white animate-[scale-in_1s_ease-out] hover:scale-105 transition-transform duration-300">
                      <div className="flex items-center gap-3 mb-3">
                        <Zap className="w-8 h-8 animate-bounce" />
                        <div className="text-sm font-semibold animate-[fade-in_1.2s_ease-out]">With Trinity</div>
                      </div>
                      <div className="text-5xl font-black mb-2 animate-[scale-in_1.3s_ease-out]">2-4 hours</div>
                      <div className="flex items-center gap-2 animate-[fade-in_1.5s_ease-out]">
                        <div className="text-3xl font-bold">10×</div>
                        <span className="text-sm">faster</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Benefit 3 - Visualization Left, Text Right */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent/5 rounded-3xl transform group-hover:scale-105 transition-transform duration-500"></div>
                <div className="relative bg-white rounded-3xl border-2 border-accent/20 p-12 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  {/* Neural Network Animation */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                      {[...Array(12)].map((_, i) => {
                        const angle = (i * 30) * (Math.PI / 180);
                        const x = 50 + Math.cos(angle) * 35;
                        const y = 50 + Math.sin(angle) * 35;
                        return (
                          <g key={i}>
                            <line
                              x1="50"
                              y1="50"
                              x2={x}
                              y2={y}
                              stroke="currentColor"
                              strokeWidth="0.3"
                              className="text-accent"
                            />
                            <circle
                              cx={x}
                              cy={y}
                              r="2"
                              fill="currentColor"
                              className="text-accent"
                            >
                              <animate
                                attributeName="r"
                                values="2;3;2"
                                dur={`${2 + i * 0.1}s`}
                                repeatCount="indefinite"
                              />
                            </circle>
                          </g>
                        );
                      })}
                      <circle
                        cx="50"
                        cy="50"
                        r="4"
                        fill="currentColor"
                        className="text-accent"
                      >
                        <animate
                          attributeName="r"
                          values="4;5;4"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    </svg>
                  </div>
                  
                  <div className="space-y-8 relative z-10">
                    <div className="flex items-center gap-4 animate-[fade-in_0.5s_ease-out]">
                      <div className="w-16 h-16 bg-gradient-to-br from-accent to-accent/60 rounded-2xl flex items-center justify-center animate-[scale-in_0.8s_ease-out] hover:rotate-12 transition-transform duration-300">
                        <Brain className="w-9 h-9 text-white animate-pulse" />
                      </div>
                      <div className="animate-[fade-in_0.8s_ease-out]">
                        <div className="text-sm font-semibold text-muted-foreground">AI Co-pilot</div>
                        <div className="text-3xl font-black text-accent hover:scale-110 transition-transform duration-300">70% Less Work</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 bg-accent/5 rounded-xl border border-accent/20 animate-[fade-in_0.8s_ease-out] hover:scale-105 hover:bg-accent/10 transition-all duration-300">
                        <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0 animate-[scale-in_1s_ease-out]" />
                        <div className="animate-[fade-in_1.2s_ease-out]">
                          <div className="font-semibold text-foreground mb-1">Auto Model Building</div>
                          <div className="text-sm text-muted-foreground">Guides you through feature selection and model configuration</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 bg-accent/5 rounded-xl border border-accent/20 animate-[fade-in_1.1s_ease-out] hover:scale-105 hover:bg-accent/10 transition-all duration-300">
                        <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0 animate-[scale-in_1.3s_ease-out]" />
                        <div className="animate-[fade-in_1.5s_ease-out]">
                          <div className="font-semibold text-foreground mb-1">Smart Explanations</div>
                          <div className="text-sm text-muted-foreground">Interprets results in business language</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 bg-accent/5 rounded-xl border border-accent/20 animate-[fade-in_1.4s_ease-out] hover:scale-105 hover:bg-accent/10 transition-all duration-300">
                        <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0 animate-[scale-in_1.6s_ease-out]" />
                        <div className="animate-[fade-in_1.8s_ease-out]">
                          <div className="font-semibold text-foreground mb-1">Next Step Suggestions</div>
                          <div className="text-sm text-muted-foreground">Recommends optimal actions based on insights</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t-2 border-accent/10">
                      <span className="text-sm font-medium text-muted-foreground">Powered by</span>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-accent animate-pulse" />
                        <span className="font-bold text-accent">Agentic AI</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 animate-fade-in">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  Powered by <span className="text-accent">Agentic AI co-pilot</span>
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Reduces analytical workload by up to 70%, automatically guiding model building, explaining results, and suggesting next steps. Your intelligent assistant for data science.
                </p>
              </div>
            </div>

            {/* Benefit 4 - Text Left, Visualization Right */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6 animate-fade-in">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  Advanced <span className="text-primary">Predictive & Causal</span> Intelligence
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Improves forecast and decision accuracy by 15–25%, using predictive and causal models that learn continuously from new data. Make confident, data-backed decisions.
                </p>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl transform group-hover:scale-105 transition-transform duration-500"></div>
                <div className="relative bg-white rounded-3xl border-2 border-primary/20 p-12 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  {/* Predictive Wave Pattern */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {[...Array(4)].map((_, i) => (
                        <path
                          key={i}
                          d="M 0 50 Q 25 30, 50 50 T 100 50"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.5"
                          className={i % 2 === 0 ? "text-primary" : "text-secondary"}
                          transform={`translate(0, ${i * 15 - 20})`}
                        >
                          <animate
                            attributeName="d"
                            values="M 0 50 Q 25 30, 50 50 T 100 50; M 0 50 Q 25 70, 50 50 T 100 50; M 0 50 Q 25 30, 50 50 T 100 50"
                            dur={`${3 + i * 0.5}s`}
                            repeatCount="indefinite"
                          />
                        </path>
                      ))}
                    </svg>
                  </div>
                  
                  <div className="space-y-8 relative z-10">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 rounded-2xl border border-primary/20 animate-[fade-in_0.6s_ease-out] hover:scale-105 transition-transform duration-300">
                        <BarChart3 className="w-8 h-8 text-primary mb-3 animate-[scale-in_0.8s_ease-out]" />
                        <div className="text-sm font-semibold text-muted-foreground mb-2">Forecast Accuracy</div>
                        <div className="text-4xl font-black text-primary animate-[scale-in_1s_ease-out]">+25%</div>
                      </div>

                      <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 p-6 rounded-2xl border border-secondary/20 animate-[fade-in_0.8s_ease-out] hover:scale-105 transition-transform duration-300">
                        <TrendingUp className="w-8 h-8 text-secondary mb-3 animate-[scale-in_1s_ease-out]" />
                        <div className="text-sm font-semibold text-muted-foreground mb-2">Decision Quality</div>
                        <div className="text-4xl font-black text-secondary animate-[scale-in_1.2s_ease-out]">+20%</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-[fade-in_1s_ease-out] hover:bg-primary/5 hover:scale-105 transition-all duration-300">
                        <span className="text-sm font-medium text-foreground">Predictive Models</span>
                        <CheckCircle className="w-5 h-5 text-primary animate-[scale-in_1.2s_ease-out]" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-[fade-in_1.2s_ease-out] hover:bg-primary/5 hover:scale-105 transition-all duration-300">
                        <span className="text-sm font-medium text-foreground">Causal Analysis</span>
                        <CheckCircle className="w-5 h-5 text-primary animate-[scale-in_1.4s_ease-out]" />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-[fade-in_1.4s_ease-out] hover:bg-primary/5 hover:scale-105 transition-all duration-300">
                        <span className="text-sm font-medium text-foreground">Continuous Learning</span>
                        <CheckCircle className="w-5 h-5 text-primary animate-[scale-in_1.6s_ease-out]" />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 p-4 rounded-xl border border-primary/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                          <span className="text-sm font-semibold text-foreground">Live model training</span>
                        </div>
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Benefit 5 - Visualization Left, Text Right */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-accent/10 rounded-3xl transform group-hover:scale-105 transition-transform duration-500"></div>
                <div className="relative bg-white rounded-3xl border-2 border-secondary/20 p-12 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  {/* Collaboration Network Grid */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                      {[...Array(5)].map((_, row) =>
                        [...Array(5)].map((_, col) => {
                          const x = 20 + col * 15;
                          const y = 20 + row * 15;
                          return (
                            <g key={`${row}-${col}`}>
                              {col < 4 && (
                                <line
                                  x1={x}
                                  y1={y}
                                  x2={x + 15}
                                  y2={y}
                                  stroke="currentColor"
                                  strokeWidth="0.3"
                                  className="text-secondary"
                                  opacity="0.5"
                                />
                              )}
                              {row < 4 && (
                                <line
                                  x1={x}
                                  y1={y}
                                  x2={x}
                                  y2={y + 15}
                                  stroke="currentColor"
                                  strokeWidth="0.3"
                                  className="text-accent"
                                  opacity="0.5"
                                />
                              )}
                              <circle
                                cx={x}
                                cy={y}
                                r="1.5"
                                fill="currentColor"
                                className={(row + col) % 2 === 0 ? "text-secondary" : "text-accent"}
                              >
                                <animate
                                  attributeName="r"
                                  values="1.5;2.5;1.5"
                                  dur={`${2 + (row + col) * 0.1}s`}
                                  repeatCount="indefinite"
                                />
                              </circle>
                            </g>
                          );
                        })
                      )}
                    </svg>
                  </div>
                  
                  <div className="space-y-8 relative z-10">
                    <div className="flex items-center justify-between animate-[fade-in_0.5s_ease-out]">
                      <div className="animate-[fade-in_0.8s_ease-out]">
                        <div className="text-sm font-semibold text-muted-foreground mb-2">Efficiency Gain</div>
                        <div className="text-5xl font-black text-secondary hover:scale-110 transition-transform duration-300">50-60%</div>
                      </div>
                      <div className="flex gap-2">
                        <Database className="w-8 h-8 text-secondary animate-[scale-in_1s_ease-out] hover:rotate-12 transition-transform duration-300" />
                        <FileSpreadsheet className="w-8 h-8 text-accent animate-[scale-in_1.2s_ease-out] hover:rotate-12 transition-transform duration-300" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-secondary/10 p-4 rounded-xl text-center border border-secondary/20 hover:border-secondary transition-all animate-[fade-in_0.8s_ease-out] hover:scale-110 duration-300">
                        <FileSpreadsheet className="w-6 h-6 text-secondary mx-auto mb-2 animate-[scale-in_1s_ease-out]" />
                        <div className="text-xs font-semibold text-foreground">Templates</div>
                      </div>
                      <div className="bg-accent/10 p-4 rounded-xl text-center border border-accent/20 hover:border-accent transition-all animate-[fade-in_1s_ease-out] hover:scale-110 duration-300">
                        <Database className="w-6 h-6 text-accent mx-auto mb-2 animate-[scale-in_1.2s_ease-out]" />
                        <div className="text-xs font-semibold text-foreground">Workspaces</div>
                      </div>
                      <div className="bg-primary/10 p-4 rounded-xl text-center border border-primary/20 hover:border-primary transition-all animate-[fade-in_1.2s_ease-out] hover:scale-110 duration-300">
                        <CheckCircle className="w-6 h-6 text-primary mx-auto mb-2 animate-[scale-in_1.4s_ease-out]" />
                        <div className="text-xs font-semibold text-foreground">Sharing</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 bg-gradient-to-r from-secondary/5 to-accent/5 rounded-xl border border-secondary/20 animate-[fade-in_1.2s_ease-out] hover:scale-105 transition-transform duration-300">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">Reusable Templates</span>
                          <span className="text-xs font-bold text-secondary animate-[fade-in_1.5s_ease-out]">+40%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-secondary rounded-full animate-[scale-in_1.6s_ease-out] origin-left" style={{ width: '80%' }}></div>
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-r from-accent/5 to-primary/5 rounded-xl border border-accent/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">Knowledge Sharing</span>
                          <span className="text-xs font-bold text-accent">+30%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full animate-[scale-in_1.2s_ease-out] origin-left" style={{ width: '60%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 animate-fade-in">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  <span className="text-secondary">Reusable</span>, Shareable, <span className="text-accent">Scalable</span>
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Cuts redundant analytics effort by 50–60% through reusable templates, collaborative workspaces, and organization-wide knowledge sharing. Build once, use everywhere.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="w-full bg-gradient-to-b from-muted/30 to-white py-24">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              Everything you need <span className="text-primary">in one platform</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Powerful features designed to make data science accessible to everyone
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const colors = ['primary', 'secondary', 'accent'];
              const color = colors[index % colors.length];
              const bgColors = ['from-primary/5 to-primary/0', 'from-secondary/5 to-secondary/0', 'from-accent/5 to-accent/0'];
              const bgColor = bgColors[index % bgColors.length];
              const borderColors = ['border-primary/20 hover:border-primary', 'border-secondary/20 hover:border-secondary', 'border-accent/20 hover:border-accent'];
              const borderColor = borderColors[index % borderColors.length];
              
              return (
                <div 
                  key={index} 
                  className={`bg-gradient-to-br ${bgColor} bg-white p-8 rounded-3xl border-2 ${borderColor} transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group relative overflow-hidden`}
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-${color}/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500`}></div>
                  <div className="relative z-10">
                    <div className={`w-14 h-14 bg-gradient-to-br from-${color} to-${color}/60 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all shadow-md`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className={`text-xl font-bold text-foreground mb-3 group-hover:text-${color} transition-colors`}>
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="w-full bg-gradient-to-br from-white via-secondary/5 to-accent/5 py-24 relative overflow-hidden">
        <div className="absolute top-20 right-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-10 w-64 h-64 bg-accent/5 rounded-full blur-3xl"></div>
        
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              See how it <span className="text-secondary">works</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              From data to insights in three simple steps
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
            <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl border-2 border-primary/20 overflow-hidden shadow-2xl group">
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-sm group-hover:backdrop-blur-none transition-all">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform cursor-pointer">
                  <Play className="w-10 h-10 text-primary ml-2" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5">
                <div className="absolute top-8 left-8 right-8 h-16 bg-white/50 rounded-xl"></div>
                <div className="absolute top-28 left-8 right-8 bottom-8 grid grid-cols-3 gap-4">
                  <div className="bg-white/50 rounded-xl"></div>
                  <div className="bg-white/50 rounded-xl"></div>
                  <div className="bg-white/50 rounded-xl"></div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex gap-6 group">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <span className="text-2xl font-bold text-white">1</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">Upload Your Data</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Import from Excel, CSV, or connect directly to your database in seconds.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 group">
                <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary/60 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <span className="text-2xl font-bold text-white">2</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-secondary transition-colors">Analyze and Model</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Use AI, or drag- and drop- blocks, or any pre-built template to create sophisticated analysis workflows.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 group">
                <div className="w-16 h-16 bg-gradient-to-br from-accent to-accent/60 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <span className="text-2xl font-bold text-white">3</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-accent transition-colors">Get Insights</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Generate actionable insights and beautiful visualizations instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Capture Section */}
      <section id="signup" className="w-full bg-gradient-to-br from-black via-gray-900 to-black py-24 relative overflow-hidden">
        {/* Space-like gradient */}
        <div className="absolute inset-0">
          {/* Radial gradients for depth */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#fec107]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl"></div>
          
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        </div>
        
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 relative z-10">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 bg-[#fec107]/20 backdrop-blur-sm px-5 py-2 rounded-full border border-[#fec107]/30">
              <Sparkles className="w-5 h-5 text-[#fec107]" />
              <span className="text-sm font-semibold text-[#fec107]">Unlock your data superpowers</span>
            </div>
            
             <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#fec107]">
               Reserve your spot - empower your analytics with Trinity.
             </h2>
            {/* <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto">
              Make smarter decisions with data.
            </p> */}

            <div className="max-w-2xl mx-auto">
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input 
                    type="text" 
                    placeholder="First Name" 
                    className="h-12 text-base bg-white/95 border-0 focus:ring-2 focus:ring-white text-foreground placeholder:text-muted-foreground rounded-xl"
                  />
                  <Input 
                    type="text" 
                    placeholder="Last Name" 
                    className="h-12 text-base bg-white/95 border-0 focus:ring-2 focus:ring-white text-foreground placeholder:text-muted-foreground rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input 
                    type="email" 
                    placeholder="Work Email" 
                    className="h-12 text-base bg-white/95 border-0 focus:ring-2 focus:ring-white text-foreground placeholder:text-muted-foreground rounded-xl"
                  />
                  <Input 
                    type="text" 
                    placeholder="Institution/Company" 
                    className="h-12 text-base bg-white/95 border-0 focus:ring-2 focus:ring-white text-foreground placeholder:text-muted-foreground rounded-xl"
                  />
                </div>
                <Button 
                  size="lg"
                  className="w-full h-12 bg-[#fec107] hover:bg-[#e0ad06] text-black font-bold text-base rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                  onClick={() => navigate('/login')}
                >
                    Get early access
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
              {/* <p className="text-sm text-white/70 mt-4">
                No credit card required · 14-day free trial · Cancel anytime
              </p> */}
            </div>

            <div className="flex flex-wrap justify-center gap-8 pt-8">
              {/* <div className="flex items-center gap-3 text-white">
                <CheckCircle className="w-6 h-6" />
                <span className="font-semibold">Free for 14 days</span>
              </div> */}
              <div className="flex items-center gap-3 text-white">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">No coding needed</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full bg-white py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
      {/* <section id="faq" className="w-full bg-white py-24 relative overflow-hidden"> */}
        {/* Static Question Mark Pattern Background */}
        {/* <div className="absolute inset-0 opacity-70">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="questionMarkGrid" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
                <text 
                  x="1.5" 
                  y="2.3" 
                  fontSize="2.5" 
                  textAnchor="middle" 
                  fill="hsl(var(--primary) / 0.2)" 
                  fontWeight="bold"
                  fontFamily="Arial, sans-serif"
                >
                  ?
                </text>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#questionMarkGrid)" />
          </svg>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 relative z-10"> */}


          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              Common <span className="text-accent">questions</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground">
              Everything you need to know about Trinity
            </p>
          </div>

          <Accordion type="single" collapsible className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {faqs.map((faq, index) => {
                const colors = ['primary', 'secondary', 'accent'];
                const color = colors[index % colors.length];
                return (
                  <AccordionItem 
                    key={index}
                    value={`item-${index}`}
                    className={`bg-gradient-to-r from-white to-${color}/5 border-2 border-border rounded-2xl px-8 py-2 hover:border-${color} hover:shadow-lg transition-all duration-300 self-start`}
                  >
                    <AccordionTrigger className={`text-left text-lg md:text-xl font-bold text-foreground hover:no-underline hover:text-${color} transition-colors py-6`}>
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base md:text-lg text-muted-foreground leading-relaxed pb-6">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </div>
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-border bg-gradient-to-b from-muted to-white py-16">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="space-y-6">
              <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => scrollToTop()}>
                <AnimatedLogo className="w-12 h-12 shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all" />
                <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">Trinity</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Making data science accessible to everyone, everywhere.
              </p>
              <div className="flex gap-3">
                <a href="https://www.linkedin.com/company/quant-matrix-ai-solutions/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white border-2 border-border hover:border-secondary rounded-lg flex items-center justify-center transition-all hover:scale-110">
                  <span className="text-secondary font-bold">in</span>
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-6 text-base">Product</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#features" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">Features</a></li>
                <li><a href="#demo" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">Demo</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-6 text-base">Company</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#about" className="hover:text-secondary transition-colors hover:translate-x-1 inline-block">About</a></li>
                <li><a href="#contact" className="hover:text-secondary transition-colors hover:translate-x-1 inline-block">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-6 text-base">Resources</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li><a href="#privacy" className="hover:text-accent transition-colors hover:translate-x-1 inline-block">Privacy</a></li>
                <li><a href="#terms" className="hover:text-accent transition-colors hover:translate-x-1 inline-block">Terms</a></li>
                <li><a href="#help" className="hover:text-accent transition-colors hover:translate-x-1 inline-block">Help Center</a></li>
                <li><a href="#docs" className="hover:text-accent transition-colors hover:translate-x-1 inline-block">Documentation</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t-2 border-border pt-8 flex flex-col md:flex-row justify-center items-center gap-4">
            <p className="text-muted-foreground">© {new Date().getFullYear()} Trinity. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 w-14 h-14 bg-[#fec107] hover:bg-[#e0ad06] text-black rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:rotate-12 animate-fade-in group"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
    </>
  );
};

export default Home;