/**
 * Insight Generator Utility
 * Generates insights for atom steps by calling the insight API in parallel
 */

import { INSIGHT_API } from '@/lib/api';
import { getDataSummary, StandardizedDataSummary } from './dataSummaryExtractors';

export interface InsightGenerationParams {
  data: any;
  atomType: string;
  sessionId?: string;
}

export interface InsightResult {
  success: boolean;
  insight: string;
  error?: string;
}

/**
 * Generate insight for an atom step
 * This function calls the insight API in parallel (non-blocking)
 * Returns a promise that resolves with the insight result
 */
export const generateAtomInsight = async (
  params: InsightGenerationParams
): Promise<InsightResult> => {
  const { data, atomType, sessionId } = params;
  
  try {
    // Extract smart_response, response, and reasoning
    const smartResponse = data.smart_response || data.data?.smart_response || data.smartResponse || '';
    const response = data.response || data.data?.response || '';
    const reasoning = data.reasoning || data.data?.reasoning || '';
    
    // Get standardized data summary
    const dataSummary = getDataSummary(atomType, data);
    
    // Prepare request payload
    const requestPayload = {
      smart_response: smartResponse,
      response: response,
      reasoning: reasoning,
      data_summary: dataSummary,
      atom_type: atomType,
      session_id: sessionId,
    };
    
    // 📝 LOG: What we're sending to LLM
    console.log('\n' + '='.repeat(80));
    console.log('📤 FRONTEND: Sending to Insight API (what LLM will see)');
    console.log('='.repeat(80));
    console.log(`Atom Type: ${atomType}`);
    console.log(`Session ID: ${sessionId || 'N/A'}`);
    console.log('\n--- Smart Response (User-friendly): ---');
    console.log(smartResponse || '(empty)');
    console.log('\n--- Response (Raw thinking): ---');
    console.log(response || '(empty)');
    console.log('\n--- Reasoning: ---');
    console.log(reasoning || '(empty)');
    console.log('\n--- Data Summary: ---');
    console.log(JSON.stringify(dataSummary, null, 2));
    console.log('='.repeat(80) + '\n');
    
    // Call insight API - Open new HTTP connection to LLM
    console.log('\n' + '='.repeat(80));
    console.log('🌐 OPENING NEW CONNECTION: Calling Insight API');
    console.log('='.repeat(80));
    console.log(`API Endpoint: ${INSIGHT_API}/generate-atom-insight`);
    console.log(`Method: POST`);
    console.log('='.repeat(80) + '\n');
    
    const insightResponse = await fetch(`${INSIGHT_API}/generate-atom-insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('📡 CONNECTION STATUS: Insight API Response');
    console.log('='.repeat(80));
    console.log(`Status: ${insightResponse.status} ${insightResponse.statusText}`);
    console.log(`OK: ${insightResponse.ok}`);
    console.log('='.repeat(80) + '\n');
    
    if (!insightResponse.ok) {
      const errorText = await insightResponse.text();
      console.error('❌ Insight API error:', insightResponse.status, errorText);
      return {
        success: false,
        insight: '',
        error: `Insight generation failed: ${insightResponse.status}`,
      };
    }
    
    const insightData = await insightResponse.json();
    
    // 📝 LOG: What we received from LLM
    console.log('\n' + '='.repeat(80));
    console.log('📥 FRONTEND: Received from Insight API (LLM response)');
    console.log('='.repeat(80));
    console.log(`Success: ${insightData.success}`);
    console.log(`Processing Time: ${insightData.processing_time?.toFixed(2) || 'N/A'}s`);
    console.log('\n--- Generated Insight (what user will see in UI): ---');
    console.log(insightData.insight || '(empty)');
    console.log('='.repeat(80) + '\n');
    
    if (insightData.success && insightData.insight) {
      console.log('✅ Atom insight generated successfully - will be displayed in chat box and text box');
      return {
        success: true,
        insight: insightData.insight,
      };
    } else {
      console.warn('⚠️ Insight generation returned unsuccessful result');
      return {
        success: false,
        insight: insightData.insight || '',
        error: 'Insight generation was unsuccessful',
      };
    }
    
  } catch (error) {
    console.error('❌ Error generating atom insight:', error);
    return {
      success: false,
      insight: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Format insight content for text box display
 * Combines smart_response, response, reasoning, and generated insight
 */
export const formatInsightForTextBox = (
  smartResponse: string,
  response: string,
  reasoning: string,
  insight: string
): string => {
  let formattedText = '';
  
  if (smartResponse) {
    formattedText += `**Smart Response:**\n${smartResponse}\n\n`;
  }
  
  if (reasoning) {
    formattedText += `**Reasoning:**\n${reasoning}\n\n`;
  }
  
  if (response) {
    formattedText += `**Response:**\n${response}\n\n`;
  }
  
  if (insight) {
    formattedText += `**Insight:**\n${insight}\n\n`;
  }
  
  return formattedText.trim() || 'No insight data available.';
};

/**
 * Generate insight and format for text box
 * This is a convenience function that combines insight generation and formatting
 */
export const generateAndFormatInsight = async (
  params: InsightGenerationParams
): Promise<{ formattedContent: string; insight: string }> => {
  const { data } = params;
  
  // Extract fields
  const smartResponse = data.smart_response || data.data?.smart_response || data.smartResponse || '';
  const response = data.response || data.data?.response || '';
  const reasoning = data.reasoning || data.data?.reasoning || '';
  
  // Generate insight
  const insightResult = await generateAtomInsight(params);
  
  // Format for text box
  const formattedContent = formatInsightForTextBox(
    smartResponse,
    response,
    reasoning,
    insightResult.insight
  );
  
  return {
    formattedContent,
    insight: insightResult.insight,
  };
};

