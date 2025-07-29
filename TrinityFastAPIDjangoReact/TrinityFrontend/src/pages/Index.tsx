
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Microscope, Presentation } from 'lucide-react';
import Header from '@/components/Header';
import ModeCard from '@/components/ModeCard';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-6xl mx-auto px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-light text-gray-900 mb-6">
            Welcome to <span className="bg-gradient-to-r from-[#FFBD59] to-[#41C185] bg-clip-text text-transparent">Trinity</span>
          </h1>
          <p className="text-xl text-gray-600 font-light max-w-3xl mx-auto leading-relaxed">
            Build sophisticated data science applications with our intuitive interface. 
            Choose your mode to get started.
          </p>
        </div>

        <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <ModeCard
            title="Workflow Mode"
            description="Create complex data science workflows by connecting predefined molecules. Drag and drop molecules to build your pipeline."
            icon={Workflow}
            color="text-[#9E86ED]"
            bgColor="bg-purple-50"
            onClick={() => navigate('/workflow')}
          />
          
          <ModeCard
            title="Laboratory Mode"
            description="Experiment with individual atoms and components. Drag and drop elements to build custom data science applications from the ground up."
            icon={Microscope}
            color="text-[#41C185]"
            bgColor="bg-green-50"
            onClick={() => navigate('/laboratory')}
          />
          
          <ModeCard
            title="Exhibition Mode"
            description="Present your results with beautiful, interactive visualizations. Transform your analysis into compelling business presentations."
            icon={Presentation}
            color="text-[#458EE2]"
            bgColor="bg-blue-50"
            onClick={() => navigate('/exhibition')}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
