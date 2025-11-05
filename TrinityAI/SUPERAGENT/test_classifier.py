"""
Test script for the intelligent prompt classifier

This script tests the prompt classifier with various inputs to ensure
it correctly identifies when to generate workflows vs general responses.
"""

from prompt_classifier import PromptClassifier

def print_classification_result(prompt: str, result: dict):
    """Pretty print classification result"""
    print(f"\n{'='*80}")
    print(f"PROMPT: {prompt}")
    print(f"{'='*80}")
    print(f"Classification:    {result['classification']}")
    print(f"Needs Workflow:    {result['needs_workflow']}")
    print(f"Confidence:        {result['confidence']:.2f}")
    print(f"Reasoning:         {result['reasoning']}")
    
    if result.get('suggested_atoms'):
        print(f"Suggested Atoms:   {', '.join(result['suggested_atoms'])}")
    
    if result.get('response_hint'):
        print(f"Response Hint:     {result['response_hint']}")


def main():
    """Run classifier tests"""
    print("\n" + "🧪 "*40)
    print("TESTING INTELLIGENT PROMPT CLASSIFIER")
    print("🧪 "*40)
    
    # Initialize classifier
    classifier = PromptClassifier()
    
    # Test cases organized by expected classification
    test_cases = {
        "General Responses (Should NOT generate workflow)": [
            "hello, how can you help me?",
            "hi there",
            "what can you do?",
            "what is a merge operation?",
            "explain what atoms are",
            "tell me about your features",
            "how does data analysis work?",
            "what are the different types of charts?",
            "good morning",
        ],
        
        "Clarification Needed (Should NOT generate workflow)": [
            "help",
            "analyze",
            "data",
            "show me",
            "do something",
        ],
        
        "Workflow Requests (SHOULD generate workflow)": [
            "merge files uk mayo and uk beans",
            "create a chart showing sales by region",
            "filter the data to show only 2023 records",
            "group by product and sum the revenue",
            "show me the correlation between price and sales",
            "concatenate all the regional files vertically",
            "plot a line chart of revenue over time",
            "calculate the average price per category",
            "transform the price column to log scale",
        ],
    }
    
    # Run tests
    for category, prompts in test_cases.items():
        print(f"\n\n{'#'*80}")
        print(f"# {category}")
        print(f"{'#'*80}")
        
        for prompt in prompts:
            try:
                result = classifier.classify_prompt(prompt)
                print_classification_result(prompt, result)
                
                # Validate expected behavior
                if "Should NOT generate workflow" in category:
                    if result['needs_workflow']:
                        print("❌ ERROR: Should NOT have triggered workflow!")
                    else:
                        print("✅ CORRECT: Did not trigger workflow")
                
                elif "SHOULD generate workflow" in category:
                    if result['needs_workflow']:
                        print("✅ CORRECT: Triggered workflow as expected")
                    else:
                        print("❌ ERROR: Should have triggered workflow!")
                
            except Exception as e:
                print(f"\n❌ ERROR classifying prompt: {e}")
                import traceback
                traceback.print_exc()
    
    print("\n\n" + "✅ "*40)
    print("CLASSIFICATION TESTS COMPLETE")
    print("✅ "*40 + "\n")


if __name__ == "__main__":
    main()

