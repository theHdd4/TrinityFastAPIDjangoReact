/**
 * Insight Generator Utility
 * Generates insights for atom steps by calling the insight API in parallel
 * Includes a global queue manager to ensure insights complete even when new atoms start
 */

import { INSIGHT_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { getDataSummary, StandardizedDataSummary } from './dataSummaryExtractors';
import { updateInsightTextBox, getEnvironmentContext } from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

/**
 * Global insight queue manager
 * Tracks pending insights to ensure they complete even when new atoms start
 */
interface PendingInsight {
  atomId: string;
  promise: Promise<InsightResult>;
  startTime: number;
}

class InsightQueueManager {
  private pendingInsights: Map<string, PendingInsight> = new Map();
  private readonly MAX_PENDING_AGE = 5 * 60 * 1000; // 5 minutes

  /**
   * Add an insight generation task to the queue
   * Returns a promise that will complete even if the component unmounts
   */
  addInsightTask(
    atomId: string,
    insightPromise: Promise<InsightResult>
  ): Promise<InsightResult> {
    console.log(`📋 Adding insight task to queue for atomId: ${atomId}`);
    
    // Store the promise with metadata
    const pendingInsight: PendingInsight = {
      atomId,
      promise: insightPromise,
      startTime: Date.now(),
    };
    
    this.pendingInsights.set(atomId, pendingInsight);
    
    // Set up completion handler that persists even if component unmounts
    const completionPromise = insightPromise
      .then(async (result) => {
        console.log(`✅ Insight generation completed for atomId: ${atomId}`);
        
        // If using async endpoint, backend handles text box update - poll for the update
        if (result.success && result.insight === '') {
          // This means async endpoint was used - backend will update card
          console.log(`📋 Async endpoint used - backend will update card for atomId: ${atomId}`);
          console.log(`🔄 Starting to poll for backend card update...`);
          
          // Poll for the card update in the background
          // Use arrow function to preserve 'this' context
          const queueManager = this;
          queueManager.pollForCardUpdate(atomId, 20, 2000).then((success) => {
            if (success) {
              console.log(`✅ Card state refreshed with insight for atomId: ${atomId}`);
            } else {
              console.warn(`⚠️ Could not refresh card state for atomId: ${atomId} - insight may still appear after manual refresh`);
            }
            // Remove from pending queue after polling completes
            queueManager.pendingInsights.delete(atomId);
          }).catch((error) => {
            console.error(`❌ Error polling for card update:`, error);
            queueManager.pendingInsights.delete(atomId);
          });
          
          return result;
        }
        
        // Fallback: If using sync endpoint or insight was returned, update text box
        if (result.success && result.insight) {
          // Update the text box with retry logic (handles state changes)
          console.log(`📝 Updating insight text box for atomId: ${atomId}`);
          const updateSuccess = await updateInsightTextBox(atomId, result.insight, 5, 1000); // More retries, longer delay
          
          if (updateSuccess) {
            console.log(`✅ Successfully updated insight text box for atomId: ${atomId}`);
          } else {
            console.warn(`⚠️ Failed to update insight text box after retries for atomId: ${atomId}`);
            // Store in a retry queue for later
            this.scheduleRetry(atomId, result.insight);
          }
        }
        
        // Remove from pending queue after a delay (in case we need to retry)
        setTimeout(() => {
          this.pendingInsights.delete(atomId);
        }, 10000); // Keep for 10 seconds after completion
        
        return result;
      })
      .catch((error) => {
        console.error(`❌ Insight generation failed for atomId: ${atomId}:`, error);
        // Remove from pending queue
        this.pendingInsights.delete(atomId);
        throw error;
      });
    
    return completionPromise;
  }

  /**
   * Schedule a retry for updating the text box
   */
  private scheduleRetry(atomId: string, insight: string, delay: number = 2000): void {
    console.log(`🔄 Scheduling retry for atomId: ${atomId} in ${delay}ms`);
    
    setTimeout(async () => {
      console.log(`🔄 Retrying insight text box update for atomId: ${atomId}`);
      const success = await updateInsightTextBox(atomId, insight, 3, 500);
      
      if (success) {
        console.log(`✅ Retry successful for atomId: ${atomId}`);
      } else {
        console.warn(`⚠️ Retry failed for atomId: ${atomId}, will try again later`);
        // Schedule another retry with exponential backoff
        this.scheduleRetry(atomId, insight, delay * 2);
      }
    }, delay);
  }

  /**
   * Get pending insights count
   */
  getPendingCount(): number {
    // Clean up old pending insights
    const now = Date.now();
    for (const [atomId, pending] of this.pendingInsights.entries()) {
      if (now - pending.startTime > this.MAX_PENDING_AGE) {
        console.warn(`⚠️ Removing stale insight task for atomId: ${atomId}`);
        this.pendingInsights.delete(atomId);
      }
    }
    
    return this.pendingInsights.size;
  }

  /**
   * Check if an insight is pending for an atom
   */
  isPending(atomId: string): boolean {
    return this.pendingInsights.has(atomId);
  }

  /**
   * Poll for updated card state from backend and refresh local store
   * This is used when backend updates the card asynchronously
   */
  private async pollForCardUpdate(atomId: string, maxAttempts: number = 20, intervalMs: number = 2000): Promise<boolean> {
    const envContext = getEnvironmentContext();
    
    if (!envContext.client_name || !envContext.app_name || !envContext.project_name) {
      console.warn('⚠️ Cannot poll for card update - missing environment context');
      return false;
    }

    const clientNameEncoded = encodeURIComponent(envContext.client_name);
    const appNameEncoded = encodeURIComponent(envContext.app_name);
    const projectNameEncoded = encodeURIComponent(envContext.project_name);
    const cardsUrl = `${LABORATORY_PROJECT_STATE_API}/get/${clientNameEncoded}/${appNameEncoded}/${projectNameEncoded}`;

    console.log(`🔄 Starting to poll for card update for atomId: ${atomId}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        
        console.log(`🔄 Polling attempt ${attempt}/${maxAttempts} for atomId: ${atomId}`);
        
        const response = await fetch(cardsUrl, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          console.warn(`⚠️ Poll attempt ${attempt} failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const cards = data.cards || [];

        // Find the card containing this atom
        for (const card of cards) {
          if (card.atoms) {
            for (const atom of card.atoms) {
              if (atom.id === atomId) {
                // Check if insight text box has been updated (not "Generating insight...")
                const textBoxes = card.textBoxes || [];
                const insightBox = textBoxes.find((tb: any) => 
                  (tb.title === 'AI Insight' || tb.title === 'Generating insight...') && 
                  tb.content && 
                  tb.content.trim() !== '' && 
                  tb.content !== 'Generating insight...'
                );

                if (insightBox && insightBox.content && insightBox.content !== 'Generating insight...') {
                  console.log(`✅ Found updated insight in card state for atomId: ${atomId}`);
                  
                  // Update local store with the fetched card state
                  const { setCards } = useLaboratoryStore.getState();
                  setCards(cards);
                  
                  console.log(`✅ Successfully refreshed card state with insight for atomId: ${atomId}`);
                  return true;
                }
              }
            }
          }
        }

        console.log(`⏳ Insight not yet updated (attempt ${attempt}/${maxAttempts}), will retry...`);
      } catch (error) {
        console.warn(`⚠️ Error polling for card update (attempt ${attempt}):`, error);
      }
    }

    console.warn(`⚠️ Polling timeout - insight may not have been updated for atomId: ${atomId}`);
    return false;
  }
}

// Global instance
const insightQueueManager = new InsightQueueManager();

/**
 * Get example insights for each atom type to guide the LLM
 */
const getExampleInsights = (atomType: string): string[] => {
  const examples: Record<string, string[]> = {
    'concat': [
      'The concatenation successfully combined 2 files (UK Beans and UK Mayo) vertically, resulting in a dataset with 15,234 rows and 12 columns. Both files had identical column structures, making vertical concatenation ideal. The combined dataset preserves all original data and maintains consistent column types.',
      'Files were concatenated vertically, stacking rows from both sources. The operation preserved all columns and data types. The result contains 8,500 rows total, combining 4,200 rows from file1 and 4,300 rows from file2. All 15 columns are present in the final dataset.',
    ],
    'merge': [
      'The merge operation successfully joined two datasets using an inner join on the "product_id" column. The result contains 12,450 rows with 18 columns, combining data from both files. The join preserved all matching records while excluding non-matching rows, ensuring data integrity.',
      'Files were merged using a left join on "customer_id" and "date" columns. The operation resulted in 25,000 rows and 22 columns, preserving all records from the left file while adding matching data from the right file. The join type ensures no data loss from the primary dataset.',
    ],
    'chart-maker': [
      'A bar chart was created showing sales by region, revealing that the North region has the highest sales at $2.5M, followed by South at $1.8M. The visualization effectively highlights regional performance differences and can help identify top-performing markets.',
      'Two charts were generated: a line chart showing sales trends over time and a pie chart displaying market share by brand. The line chart reveals a steady upward trend, while the pie chart shows Brand A dominates with 45% market share.',
    ],
    'create-transform': [
      'A new column "total_revenue" was created by multiplying "quantity" and "unit_price". The operation successfully processed 10,000 rows, adding the calculated revenue values. This transformation enables revenue analysis without modifying the original data.',
      'Three transformations were applied: renamed "cust_name" to "customer_name", created "discount_amount" by calculating 10% of "price", and filtered rows where "status" equals "active". The operations resulted in 8,500 active records with enhanced column names.',
    ],
    'groupby-wtg-avg': [
      'Data was grouped by "region" and "product_category", with sales volume aggregated using sum. The operation resulted in 45 grouped rows, showing total sales volume per region-category combination. The weighted average calculation provides accurate insights into regional product performance.',
      'Grouping by "month" and "channel" with sum aggregation on "revenue" produced 24 summary rows. The operation revealed that online channels generated $3.2M in Q1, significantly higher than retail channels at $1.8M. This insight helps identify the most profitable sales channels.',
    ],
    'correlation': [
      'Correlation analysis revealed a strong positive correlation (0.85) between "advertising_spend" and "sales_revenue", indicating that increased advertising directly impacts sales. A moderate negative correlation (-0.42) was found between "price" and "quantity_sold", suggesting price sensitivity.',
      'The correlation matrix shows "customer_satisfaction" and "repeat_purchases" have a high correlation of 0.78, while "discount_rate" and "profit_margin" show a negative correlation of -0.65. These relationships help understand customer behavior and pricing strategies.',
    ],
    'dataframe-operations': [
      'Three operations were executed: loaded a dataset with 50,000 rows, filtered for records where "status" equals "active" (resulting in 35,000 rows), and sorted by "date" in descending order. The final dataset is ready for analysis with active records in chronological order.',
      'A series of operations transformed the data: loaded file, applied formula to create "profit" column (revenue - cost), filtered rows with profit > 0, and sorted by profit descending. The final dataset contains 12,000 profitable transactions, sorted by profitability.',
    ],
    'explore': [
      'Exploration generated two visualizations: a bar chart showing sales by product category and a line chart displaying monthly trends. The bar chart reveals Electronics category leads with $5M sales, while the line chart shows consistent growth from January to December.',
      'Three exploration charts were created analyzing customer segments. The visualizations show demographic distribution, purchase frequency patterns, and revenue by segment. Key insight: Millennials represent 45% of customers but generate 60% of revenue.',
    ],
    'data-upload-validate': [
      'Data validation completed successfully. The file contains 25,000 rows and 15 columns with no critical errors. Minor warnings were found: 3 duplicate rows and 5 missing values in optional columns. The dataset is ready for analysis.',
      'Validation identified 2 critical issues: 150 rows with invalid date formats and 50 rows with negative values in "quantity" field. After cleaning, 24,800 valid rows remain. The dataset structure is correct with all required columns present.',
    ],
  };
  
  return examples[atomType] || [
    `The ${atomType} operation completed successfully. The data has been processed and is ready for further analysis.`,
  ];
};

export interface InsightGenerationParams {
  data: any;
  atomType: string;
  sessionId?: string;
  atomId?: string; // Add atomId to ensure queue manager can track it
}

export interface InsightResult {
  success: boolean;
  insight: string;
  error?: string;
}

/**
 * Generate insight for an atom step
 * This function calls the insight API and ensures completion even when new atoms start
 * Uses a global queue manager to track and complete insights independently
 * Returns a promise that resolves with the insight result
 */
export const generateAtomInsight = async (
  params: InsightGenerationParams
): Promise<InsightResult> => {
  // Get atomId from params or data
  const atomId = params.atomId || params.data?.atomId || params.data?.atom_id;
  
  // If we have an atomId, use the queue manager to ensure completion
  // The queue manager will handle the text box update automatically
  if (atomId) {
    console.log(`📋 Using queue manager for atomId: ${atomId}`);
    const insightPromise = generateAtomInsightInternal(params);
    return insightQueueManager.addInsightTask(atomId, insightPromise);
  }
  
  // Fallback to direct call if no atomId (but this shouldn't happen in normal flow)
  console.warn('⚠️ generateAtomInsight called without atomId, using direct call');
  return generateAtomInsightInternal(params);
};

/**
 * Internal insight generation function
 * Uses async backend endpoint that processes in background and updates card automatically
 */
const generateAtomInsightInternal = async (
  params: InsightGenerationParams
): Promise<InsightResult> => {
  const { data, atomType, sessionId } = params;
  const atomId = params.atomId || params.data?.atomId || params.data?.atom_id;
  
  console.log('🚀🚀🚀 generateAtomInsight CALLED');
  console.log('🚀🚀🚀 atomType:', atomType);
  console.log('🚀🚀🚀 sessionId:', sessionId);
  console.log('🚀🚀🚀 atomId:', atomId);
  console.log('🚀🚀🚀 data keys:', Object.keys(data));
  
  try {
    // Extract only reasoning field (smart_response and response are no longer used)
    const reasoning = data.reasoning || data.data?.reasoning || '';
    
    console.log('🚀🚀🚀 Extracted fields:', {
      hasReasoning: !!reasoning,
      reasoningLength: reasoning.length,
    });
    
    // Get standardized data summary
    const dataSummary = getDataSummary(atomType, data);
    console.log('🚀🚀🚀 Data summary:', {
      atom_type: dataSummary.atom_type,
      summaryDataKeys: Object.keys(dataSummary.summary_data || {}),
      metadataKeys: Object.keys(dataSummary.metadata || {}),
    });
    
    // Get example insights for this atom type
    const examples = getExampleInsights(atomType);
    
    // Get environment context for card update using utility function
    const envContext = getEnvironmentContext();
    const clientName = envContext.client_name || '';
    const appName = envContext.app_name || '';
    const projectName = envContext.project_name || '';
    
    if (!clientName || !appName || !projectName) {
      console.warn('⚠️ Missing environment context for insight generation:', {
        clientName: !!clientName,
        appName: !!appName,
        projectName: !!projectName
      });
    }
    
    // Use async endpoint if we have atomId (backend will update card automatically)
    if (atomId) {
      console.log('🚀🚀🚀 Using async endpoint - backend will update card automatically');
      
      const asyncRequestPayload = {
        reasoning: reasoning,
        data_summary: dataSummary,
        atom_type: atomType,
        session_id: sessionId,
        atom_id: atomId,
        client_name: clientName,
        app_name: appName,
        project_name: projectName,
        examples: examples,
      };
      
      console.log('🚀🚀🚀 Calling async insight API:', `${INSIGHT_API}/generate-atom-insight-async`);
      
      const asyncResponse = await fetch(`${INSIGHT_API}/generate-atom-insight-async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(asyncRequestPayload),
      });
      
      console.log('🚀🚀🚀 Async insight API response status:', asyncResponse.status);
      
      if (!asyncResponse.ok) {
        const errorText = await asyncResponse.text();
        console.error('❌ Async insight API error:', asyncResponse.status, errorText);
        return {
          success: false,
          insight: '',
          error: `Async insight generation failed: ${asyncResponse.status}`,
        };
      }
      
      const asyncResult = await asyncResponse.json();
      
      if (asyncResult.success) {
        console.log('✅ Async insight generation started successfully');
        // Return success immediately - backend will update card when complete
        return {
          success: true,
          insight: '', // Empty for now, backend will update card directly
        };
      } else {
        return {
          success: false,
          insight: '',
          error: asyncResult.message || 'Failed to start async insight generation',
        };
      }
    }
    
    // Fallback to synchronous endpoint if no atomId
    console.log('⚠️ No atomId provided, using synchronous endpoint');
    
    const requestPayload = {
      reasoning: reasoning,
      data_summary: dataSummary,
      atom_type: atomType,
      session_id: sessionId,
      examples: examples,
    };
    
    console.log('🚀🚀🚀 Calling synchronous insight API:', INSIGHT_API);
    
    const insightResponse = await fetch(`${INSIGHT_API}/generate-atom-insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    
    console.log('🚀🚀🚀 Insight API response status:', insightResponse.status);
    
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
    
    if (insightData.success && insightData.insight) {
      return {
        success: true,
        insight: insightData.insight,
      };
    } else {
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
 * Now only uses reasoning field (smart_response and response are no longer used)
 */
export const formatInsightForTextBox = (
  reasoning: string,
  insight: string
): string => {
  let formattedText = '';
  
  // Show reasoning first (this is the detailed explanation from the atom)
  if (reasoning) {
    formattedText += `**Reasoning:**\n${reasoning}\n\n`;
  }
  
  // Show generated insight if available
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
  
  // Extract only reasoning field
  const reasoning = data.reasoning || data.data?.reasoning || '';
  
  // Generate insight
  const insightResult = await generateAtomInsight(params);
  
  // Format for text box (only reasoning and insight now)
  const formattedContent = formatInsightForTextBox(
    reasoning,
    insightResult.insight
  );
  
  return {
    formattedContent,
    insight: insightResult.insight,
  };
};

