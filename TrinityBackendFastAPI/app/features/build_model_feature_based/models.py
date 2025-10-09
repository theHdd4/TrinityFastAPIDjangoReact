import numpy as np
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet, BayesianRidge

# -----------------------
# CUSTOM CLASSES
# -----------------------
class CustomConstrainedRidge(BaseEstimator, RegressorMixin):
    def __init__(self, l2_penalty=0.1, learning_rate=0.001, iterations=10000,
                 adam=False, beta1=0.9, beta2=0.999, epsilon=1e-8, 
                 negative_constraints=None, positive_constraints=None):
        self.learning_rate = learning_rate
        self.iterations = iterations
        self.l2_penalty = l2_penalty
        self.adam = adam
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.negative_constraints = negative_constraints or []
        self.positive_constraints = positive_constraints or []

    def fit(self, X, Y, feature_names):
        self.m, self.n = X.shape
        self.W = np.zeros(self.n)
        self.b = 0
        self.X = X
        self.Y = Y
        self.feature_names = feature_names
        
        # Build constraint indices from custom constraints and hardcoded rules
        self.negative_indices = []
        self.positive_indices = []
        
        # Add custom negative constraints (case-insensitive)
        for var_name in self.negative_constraints:
            # Try exact match first
            if var_name in feature_names:
                idx = feature_names.index(var_name)
                self.negative_indices.append(idx)
            else:
                    # Try case-insensitive match
                    for i, name in enumerate(feature_names):
                        if name.lower() == var_name.lower():
                            self.negative_indices.append(i)
                            break
                        # Try standardized name match (standard_ or minmax_ prefix)
                        elif (name.lower() == f"standard_{var_name.lower()}" or 
                              name.lower() == f"minmax_{var_name.lower()}"):
                            self.negative_indices.append(i)
                            break
        
        # Add custom positive constraints (case-insensitive)
        for var_name in self.positive_constraints:
            # Try exact match first
            if var_name in feature_names:
                idx = feature_names.index(var_name)
                self.positive_indices.append(idx)
            else:
                    # Try case-insensitive match
                    for i, name in enumerate(feature_names):
                        if name.lower() == var_name.lower():
                            self.positive_indices.append(i)
                            break
                        # Try standardized name match (standard_ or minmax_ prefix)
                        elif (name.lower() == f"standard_{var_name.lower()}" or 
                              name.lower() == f"minmax_{var_name.lower()}"):
                            self.positive_indices.append(i)
                            break
        
        # No hardcoded constraints - only use user-provided constraints
        
        # Debug logging (reduced for performance)
        if self.negative_constraints or self.positive_constraints:
            print(f"🔍 CustomConstrainedRidge - Constraints applied - Negative: {len(self.negative_indices)}, Positive: {len(self.positive_indices)}")
            print(f"🔍 Using Projected Gradient Descent for constraint enforcement")

        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        # Convergence tracking for projected gradient descent
        prev_W = np.copy(self.W)
        convergence_threshold = 1e-6
        converged = False

        for iteration in range(self.iterations):
            self.update_weights()
            
            # Check convergence every 100 iterations
            if iteration % 100 == 0 and iteration > 0:
                weight_change = np.linalg.norm(self.W - prev_W)
                if weight_change < convergence_threshold:
                    print(f"🔍 CustomConstrainedRidge converged after {iteration} iterations (weight change: {weight_change:.2e})")
                    converged = True
                    break
                prev_W = np.copy(self.W)
        
        if not converged:
            print(f"🔍 CustomConstrainedRidge completed {self.iterations} iterations without convergence")

        # Final constraint validation
        if not self.validate_constraints():
            violations = self.get_constraint_violations()
            print(f"⚠️ CustomConstrainedRidge constraint violations detected: {violations['total_violations']} violations")
            if violations['negative_violations']:
                print(f"   Negative constraint violations: {violations['negative_violations']}")
            if violations['positive_violations']:
                print(f"   Positive constraint violations: {violations['positive_violations']}")
        else:
            print(f"✅ CustomConstrainedRidge constraints satisfied")

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

    def project_onto_constraints(self, W):
        """
        Project weights onto the constraint set using projected gradient descent.
        This ensures the solution always remains feasible.
        """
        projected_W = W.copy()
        
        for i in range(self.n):
            if i in self.negative_indices:
                # Project to non-positive: min(W[i], 0)
                projected_W[i] = min(projected_W[i], 0)
            if i in self.positive_indices:
                # Project to non-negative: max(W[i], 0)
                projected_W[i] = max(projected_W[i], 0)
        
        return projected_W

    def validate_constraints(self):
        """
        Validate that current weights satisfy all constraints.
        Returns True if all constraints are satisfied, False otherwise.
        """
        for i in range(self.n):
            if i in self.negative_indices and self.W[i] > 1e-10:  # Small tolerance for numerical errors
                return False
            if i in self.positive_indices and self.W[i] < -1e-10:  # Small tolerance for numerical errors
                return False
        return True

    def get_constraint_violations(self):
        """
        Get detailed information about constraint violations.
        Returns a dictionary with violation details.
        """
        violations = {
            'negative_violations': [],
            'positive_violations': [],
            'total_violations': 0
        }
        
        for i in range(self.n):
            if i in self.negative_indices and self.W[i] > 1e-10:
                violations['negative_violations'].append({
                    'index': i,
                    'variable': self.feature_names[i] if i < len(self.feature_names) else f'feature_{i}',
                    'value': self.W[i]
                })
                violations['total_violations'] += 1
                
            if i in self.positive_indices and self.W[i] < -1e-10:
                violations['positive_violations'].append({
                    'index': i,
                    'variable': self.feature_names[i] if i < len(self.feature_names) else f'feature_{i}',
                    'value': self.W[i]
                })
                violations['total_violations'] += 1
        
        return violations

    def update_weights(self):
        Y_pred = self.predict(self.X)
        grad_w = (
            -(2 * (self.X.T).dot(self.Y - Y_pred))
            + 2 * self.l2_penalty * self.W
        ) / self.m
        grad_b = -(2 / self.m) * np.sum(self.Y - Y_pred)

        if self.adam:
            self.t += 1
            self.m_W = self.beta1 * self.m_W + (1 - self.beta1) * grad_w
            self.m_b = self.beta1 * self.m_b + (1 - self.beta1) * grad_b
            self.v_W = self.beta2 * self.v_W + (1 - self.beta2) * (grad_w ** 2)
            self.v_b = self.beta2 * self.v_b + (1 - self.beta2) * (grad_b ** 2)

            m_W_hat = self.m_W / (1 - self.beta1 ** self.t)
            m_b_hat = self.m_b / (1 - self.beta1 ** self.t)
            v_W_hat = self.v_W / (1 - self.beta2 ** self.t)
            v_b_hat = self.v_b / (1 - self.beta2 ** self.t)

            # Take gradient step
            W_temp = self.W - self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            b_temp = self.b - self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
            
            # Project onto constraint set
            self.W = self.project_onto_constraints(W_temp)
            self.b = b_temp
        else:
            # Take gradient step
            W_temp = self.W - self.learning_rate * grad_w
            b_temp = self.b - self.learning_rate * grad_b
            
            # Project onto constraint set
            self.W = self.project_onto_constraints(W_temp)
            self.b = b_temp

    def predict(self, X):
        return X.dot(self.W) + self.b
    
    def __sklearn_clone__(self):
        """Custom clone method for sklearn compatibility"""
        return CustomConstrainedRidge(
            l2_penalty=self.l2_penalty,
            learning_rate=self.learning_rate,
            iterations=self.iterations,
            adam=self.adam,
            beta1=self.beta1,
            beta2=self.beta2,
            epsilon=self.epsilon,
            negative_constraints=self.negative_constraints.copy() if self.negative_constraints else [],
            positive_constraints=self.positive_constraints.copy() if self.positive_constraints else []
        )


class ConstrainedLinearRegression(BaseEstimator, RegressorMixin):
    def __init__(self, learning_rate=0.01, iterations=10000,
                 adam=False, beta1=0.9, beta2=0.999, epsilon=1e-8,
                 negative_constraints=None, positive_constraints=None):
        self.learning_rate = learning_rate
        self.iterations = iterations
        self.adam = adam
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.negative_constraints = negative_constraints or []
        self.positive_constraints = positive_constraints or []

    def fit(self, X, Y, feature_names):
        self.m, self.n = X.shape
        self.W = np.zeros(self.n)
        self.b = 0
        self.X = X
        self.Y = Y
        self.feature_names = feature_names
        
        # Build constraint indices from custom constraints and hardcoded rules
        self.negative_indices = []
        self.positive_indices = []
        
        # Add custom negative constraints (case-insensitive)
        for var_name in self.negative_constraints:
            # Try exact match first
            if var_name in feature_names:
                idx = feature_names.index(var_name)
                self.negative_indices.append(idx)
            else:
                    # Try case-insensitive match
                    for i, name in enumerate(feature_names):
                        if name.lower() == var_name.lower():
                            self.negative_indices.append(i)
                            break
                        # Try standardized name match (standard_ or minmax_ prefix)
                        elif (name.lower() == f"standard_{var_name.lower()}" or 
                              name.lower() == f"minmax_{var_name.lower()}"):
                            self.negative_indices.append(i)
                            break
        
        # Add custom positive constraints (case-insensitive)
        for var_name in self.positive_constraints:
            # Try exact match first
            if var_name in feature_names:
                idx = feature_names.index(var_name)
                self.positive_indices.append(idx)
            else:
                    # Try case-insensitive match
                    for i, name in enumerate(feature_names):
                        if name.lower() == var_name.lower():
                            self.positive_indices.append(i)
                            break
                        # Try standardized name match (standard_ or minmax_ prefix)
                        elif (name.lower() == f"standard_{var_name.lower()}" or 
                              name.lower() == f"minmax_{var_name.lower()}"):
                            self.positive_indices.append(i)
                            break
        
        # No hardcoded constraints - only use user-provided constraints
        
        # Debug logging (reduced for performance)
        if self.negative_constraints or self.positive_constraints:
            print(f"🔍 ConstrainedLinearRegression - Constraints applied - Negative: {len(self.negative_indices)}, Positive: {len(self.positive_indices)}")
            print(f"🔍 Using Projected Gradient Descent for constraint enforcement")

        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        # Convergence tracking for projected gradient descent
        prev_W = np.copy(self.W)
        convergence_threshold = 1e-6
        converged = False

        for iteration in range(self.iterations):
            self.update_weights()
            
            # Check convergence every 100 iterations
            if iteration % 100 == 0 and iteration > 0:
                weight_change = np.linalg.norm(self.W - prev_W)
                if weight_change < convergence_threshold:
                    print(f"🔍 ConstrainedLinearRegression converged after {iteration} iterations (weight change: {weight_change:.2e})")
                    converged = True
                    break
                prev_W = np.copy(self.W)
        
        if not converged:
            print(f"🔍 ConstrainedLinearRegression completed {self.iterations} iterations without convergence")

        # Final constraint validation
        if not self.validate_constraints():
            violations = self.get_constraint_violations()
            print(f"⚠️ ConstrainedLinearRegression constraint violations detected: {violations['total_violations']} violations")
            if violations['negative_violations']:
                print(f"   Negative constraint violations: {violations['negative_violations']}")
            if violations['positive_violations']:
                print(f"   Positive constraint violations: {violations['positive_violations']}")
        else:
            print(f"✅ ConstrainedLinearRegression constraints satisfied")

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

    def project_onto_constraints(self, W):
        """
        Project weights onto the constraint set using projected gradient descent.
        This ensures the solution always remains feasible.
        """
        projected_W = W.copy()
        
        for i in range(self.n):
            if i in self.negative_indices:
                # Project to non-positive: min(W[i], 0)
                projected_W[i] = min(projected_W[i], 0)
            if i in self.positive_indices:
                # Project to non-negative: max(W[i], 0)
                projected_W[i] = max(projected_W[i], 0)
        
        return projected_W

    def validate_constraints(self):
        """
        Validate that current weights satisfy all constraints.
        Returns True if all constraints are satisfied, False otherwise.
        """
        for i in range(self.n):
            if i in self.negative_indices and self.W[i] > 1e-10:  # Small tolerance for numerical errors
                return False
            if i in self.positive_indices and self.W[i] < -1e-10:  # Small tolerance for numerical errors
                return False
        return True

    def get_constraint_violations(self):
        """
        Get detailed information about constraint violations.
        Returns a dictionary with violation details.
        """
        violations = {
            'negative_violations': [],
            'positive_violations': [],
            'total_violations': 0
        }
        
        for i in range(self.n):
            if i in self.negative_indices and self.W[i] > 1e-10:
                violations['negative_violations'].append({
                    'index': i,
                    'variable': self.feature_names[i] if i < len(self.feature_names) else f'feature_{i}',
                    'value': self.W[i]
                })
                violations['total_violations'] += 1
                
            if i in self.positive_indices and self.W[i] < -1e-10:
                violations['positive_violations'].append({
                    'index': i,
                    'variable': self.feature_names[i] if i < len(self.feature_names) else f'feature_{i}',
                    'value': self.W[i]
                })
                violations['total_violations'] += 1
        
        return violations

    def update_weights(self):
        Y_pred = self.predict(self.X)
        dW = -(2 * self.X.T.dot(self.Y - Y_pred)) / self.m
        db = -2 * np.sum(self.Y - Y_pred) / self.m

        if self.adam:
            self.t += 1
            self.m_W = self.beta1 * self.m_W + (1 - self.beta1) * dW
            self.m_b = self.beta1 * self.m_b + (1 - self.beta1) * db
            self.v_W = self.beta2 * self.v_W + (1 - self.beta2) * (dW ** 2)
            self.v_b = self.beta2 * self.v_b + (1 - self.beta2) * (db ** 2)

            m_W_hat = self.m_W / (1 - self.beta1 ** self.t)
            m_b_hat = self.m_b / (1 - self.beta1 ** self.t)
            v_W_hat = self.v_W / (1 - self.beta2 ** self.t)
            v_b_hat = self.v_b / (1 - self.beta2 ** self.t)

            # Take gradient step
            W_temp = self.W - self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            b_temp = self.b - self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
            
            # Project onto constraint set
            self.W = self.project_onto_constraints(W_temp)
            self.b = b_temp
        else:
            # Take gradient step
            W_temp = self.W - self.learning_rate * dW
            b_temp = self.b - self.learning_rate * db
            
            # Project onto constraint set
            self.W = self.project_onto_constraints(W_temp)
            self.b = b_temp

    def predict(self, X):
        return X.dot(self.W) + self.b
    
    def __sklearn_clone__(self):
        """Custom clone method for sklearn compatibility"""
        return ConstrainedLinearRegression(
            learning_rate=self.learning_rate,
            iterations=self.iterations,
            adam=self.adam,
            beta1=self.beta1,
            beta2=self.beta2,
            epsilon=self.epsilon,
            negative_constraints=self.negative_constraints.copy() if self.negative_constraints else [],
            positive_constraints=self.positive_constraints.copy() if self.positive_constraints else []
        )



# -----------------------
# STACK CONSTRAINED MODELS
# -----------------------

class StackConstrainedRidge(BaseEstimator, RegressorMixin):
    """
    Stack-constrained Ridge regression with combination constraints.
    
    Enforces: base_coefficient + interaction_coefficient < 0 (or > 0)
    Example: d1 + interaction_d1_comba < 0, d1 + interaction_d1_combb < 0
    """
    def __init__(self, l2_penalty=0.1, learning_rate=0.001, iterations=10000,
                 adam=False, beta1=0.9, beta2=0.999, epsilon=1e-8, 
                 negative_constraints=None, positive_constraints=None):
        self.l2_penalty = l2_penalty
        self.learning_rate = learning_rate
        self.iterations = iterations
        self.adam = adam
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.negative_constraints = negative_constraints or []
        self.positive_constraints = positive_constraints or []

    def fit(self, X, Y, feature_names):
        self.m, self.n = X.shape
        self.W = np.zeros(self.n)
        self.b = 0
        self.X = X
        self.Y = Y
        self.feature_names = feature_names
        
        # Build constraint mappings: base_idx -> [interaction_indices]
        self.negative_constraint_map = {}  # {base_idx: [interaction_indices]}
        self.positive_constraint_map = {}  # {base_idx: [interaction_indices]}
        
        # Add negative constraints
        for var_name in self.negative_constraints:
            base_idx = self._find_feature_index(var_name, 'base')
            if base_idx is not None:
                interaction_indices = self._find_interaction_indices(var_name)
                self.negative_constraint_map[base_idx] = interaction_indices
                print(f"🔍 Negative constraint: {var_name} -> base_idx: {base_idx}, interactions: {interaction_indices}")
        
        # Add positive constraints
        for var_name in self.positive_constraints:
            base_idx = self._find_feature_index(var_name, 'base')
            if base_idx is not None:
                interaction_indices = self._find_interaction_indices(var_name)
                self.positive_constraint_map[base_idx] = interaction_indices
                print(f"🔍 Positive constraint: {var_name} -> base_idx: {base_idx}, interactions: {interaction_indices}")
        
        # Initialize Adam if needed
        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        # Training with Projected Gradient Descent
        prev_loss = float('inf')
        for iteration in range(self.iterations):
            self.update_weights()
            
            # Check convergence every 100 iterations
            if iteration % 100 == 0:
                current_loss = self._calculate_loss()
                if iteration > 0 and abs(current_loss - prev_loss) < 1e-6:
                    print(f"🔍 StackConstrainedRidge converged at iteration {iteration}")
                    break
                prev_loss = current_loss

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

    def _find_feature_index(self, var_name, feature_type='base'):
        """Find the index of a base feature in the feature names"""
        for i, name in enumerate(self.feature_names):
            if feature_type == 'base' and not '_x_' in name and name.lower() == var_name.lower():
                return i
        return None

    def _find_interaction_indices(self, var_name):
        """Find all interaction indices for a given variable"""
        indices = []
        for i, name in enumerate(self.feature_names):
            if '_x_' in name and var_name.lower() in name.lower():
                indices.append(i)
        return indices

    def _calculate_loss(self):
        """Calculate current loss for convergence checking"""
        Y_pred = self.predict(self.X)
        mse = np.mean((self.Y - Y_pred) ** 2)
        l2_penalty_term = self.l2_penalty * np.sum(self.W ** 2)
        return mse + l2_penalty_term

    def update_weights(self):
        """Update weights using Projected Gradient Descent"""
        Y_pred = self.predict(self.X)
        grad_w = (
            -(2 * (self.X.T).dot(self.Y - Y_pred))
            + 2 * self.l2_penalty * self.W
        ) / self.m
        grad_b = -(2 / self.m) * np.sum(self.Y - Y_pred)
        
        # Check for NaN/Inf in gradients
        if np.any(np.isnan(grad_w)) or np.any(np.isinf(grad_w)):
            print(f"⚠️ Warning: NaN/Inf detected in grad_w, skipping update")
            return
        if np.isnan(grad_b) or np.isinf(grad_b):
            print(f"⚠️ Warning: NaN/Inf detected in grad_b, skipping update")
            return

        if self.adam:
            self.t += 1
            self.m_W = self.beta1 * self.m_W + (1 - self.beta1) * grad_w
            self.m_b = self.beta1 * self.m_b + (1 - self.beta1) * grad_b
            self.v_W = self.beta2 * self.v_W + (1 - self.beta2) * (grad_w ** 2)
            self.v_b = self.beta2 * self.v_b + (1 - self.beta2) * (grad_b ** 2)

            m_W_hat = self.m_W / (1 - self.beta1 ** self.t)
            m_b_hat = self.m_b / (1 - self.beta1 ** self.t)
            v_W_hat = self.v_W / (1 - self.beta2 ** self.t)
            v_b_hat = self.v_b / (1 - self.beta2 ** self.t)

            # Take gradient step
            W_temp = self.W - self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            b_temp = self.b - self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
        else:
            # Standard gradient descent
            W_temp = self.W - self.learning_rate * grad_w
            b_temp = self.b - self.learning_rate * grad_b
        
        # Check for NaN/Inf in temporary weights
        if np.any(np.isnan(W_temp)) or np.any(np.isinf(W_temp)):
            print(f"⚠️ Warning: NaN/Inf detected in W_temp, skipping update")
            return
        if np.isnan(b_temp) or np.isinf(b_temp):
            print(f"⚠️ Warning: NaN/Inf detected in b_temp, skipping update")
            return
        
        # Project onto constraint set
        self.W = self.project_onto_constraints(W_temp)
        self.b = b_temp
        
        # Final check for NaN/Inf after projection
        if np.any(np.isnan(self.W)) or np.any(np.isinf(self.W)):
            print(f"❌ Error: NaN/Inf detected in W after projection!")
            self.W = np.zeros(self.n)  # Reset to zeros
        if np.isnan(self.b) or np.isinf(self.b):
            print(f"❌ Error: NaN/Inf detected in b after projection!")
            self.b = 0  # Reset to zero

    def project_onto_constraints(self, W):
        """Project weights onto combination constraints using improved mapping"""
        projected_W = W.copy()
        
        # Apply negative constraints: base + interaction ≤ 0
        for base_idx, interaction_indices in self.negative_constraint_map.items():
            for inter_idx in interaction_indices:
                if 0 <= base_idx < len(W) and 0 <= inter_idx < len(W):
                    total_beta = W[base_idx] + W[inter_idx]
                    if total_beta > 0:  # Violation
                        deficit = -total_beta
                        # Half adjustment: base and interaction equally
                        projected_W[base_idx] += deficit / 2
                        projected_W[inter_idx] += deficit / 2
        
        # Apply positive constraints: base + interaction ≥ 0
        for base_idx, interaction_indices in self.positive_constraint_map.items():
            for inter_idx in interaction_indices:
                if 0 <= base_idx < len(W) and 0 <= inter_idx < len(W):
                    total_beta = W[base_idx] + W[inter_idx]
                    if total_beta < 0:  # Violation
                        deficit = -total_beta
                        # Half adjustment: base and interaction equally
                        projected_W[base_idx] += deficit / 2
                        projected_W[inter_idx] += deficit / 2
        
        return projected_W

    def predict(self, X):
        return X.dot(self.W) + self.b

    def __sklearn_clone__(self):
        """Custom clone method for sklearn compatibility"""
        return StackConstrainedRidge(
            l2_penalty=self.l2_penalty,
            learning_rate=self.learning_rate,
            iterations=self.iterations,
            adam=self.adam,
            beta1=self.beta1,
            beta2=self.beta2,
            epsilon=self.epsilon,
            negative_constraints=self.negative_constraints.copy() if self.negative_constraints else [],
            positive_constraints=self.positive_constraints.copy() if self.positive_constraints else []
        )


class StackConstrainedLinearRegression(BaseEstimator, RegressorMixin):
    """
    Stack-constrained Linear regression with combination constraints.
    
    Enforces: base_coefficient + interaction_coefficient < 0 (or > 0)
    Example: d1 + interaction_d1_comba < 0, d1 + interaction_d1_combb < 0
    """
    def __init__(self, learning_rate=0.001, iterations=10000,
                 adam=False, beta1=0.9, beta2=0.999, epsilon=1e-8, 
                 negative_constraints=None, positive_constraints=None):
        self.learning_rate = learning_rate
        self.iterations = iterations
        self.adam = adam
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.negative_constraints = negative_constraints or []
        self.positive_constraints = positive_constraints or []

    def fit(self, X, Y, feature_names):
        self.m, self.n = X.shape
        self.W = np.zeros(self.n)
        self.b = 0
        self.X = X
        self.Y = Y
        self.feature_names = feature_names
        
        # Build constraint mappings: base_idx -> [interaction_indices]
        self.negative_constraint_map = {}  # {base_idx: [interaction_indices]}
        self.positive_constraint_map = {}  # {base_idx: [interaction_indices]}
        
        # Add negative constraints
        for var_name in self.negative_constraints:
            base_idx = self._find_feature_index(var_name, 'base')
            if base_idx is not None:
                interaction_indices = self._find_interaction_indices(var_name)
                self.negative_constraint_map[base_idx] = interaction_indices
                print(f"🔍 Negative constraint: {var_name} -> base_idx: {base_idx}, interactions: {interaction_indices}")
        
        # Add positive constraints
        for var_name in self.positive_constraints:
            base_idx = self._find_feature_index(var_name, 'base')
            if base_idx is not None:
                interaction_indices = self._find_interaction_indices(var_name)
                self.positive_constraint_map[base_idx] = interaction_indices
                print(f"🔍 Positive constraint: {var_name} -> base_idx: {base_idx}, interactions: {interaction_indices}")
        
        # Initialize Adam if needed
        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        # Training with Projected Gradient Descent
        prev_loss = float('inf')
        for iteration in range(self.iterations):
            self.update_weights()
            
            # Check convergence every 100 iterations
            if iteration % 100 == 0:
                current_loss = self._calculate_loss()
                if iteration > 0 and abs(current_loss - prev_loss) < 1e-6:
                    print(f"🔍 StackConstrainedLinearRegression converged at iteration {iteration}")
                    break
                prev_loss = current_loss

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

    def _find_feature_index(self, var_name, feature_type='base'):
        """Find the index of a base feature in the feature names"""
        for i, name in enumerate(self.feature_names):
            if feature_type == 'base' and not '_x_' in name and name.lower() == var_name.lower():
                return i
        return None

    def _find_interaction_indices(self, var_name):
        """Find all interaction indices for a given variable"""
        indices = []
        for i, name in enumerate(self.feature_names):
            if '_x_' in name and var_name.lower() in name.lower():
                indices.append(i)
        return indices

    def _calculate_loss(self):
        """Calculate current loss for convergence checking"""
        Y_pred = self.predict(self.X)
        return np.mean((self.Y - Y_pred) ** 2)

    def update_weights(self):
        """Update weights using Projected Gradient Descent"""
        Y_pred = self.predict(self.X)
        grad_w = -(2 * (self.X.T).dot(self.Y - Y_pred)) / self.m
        grad_b = -(2 / self.m) * np.sum(self.Y - Y_pred)
        
        # Check for NaN/Inf in gradients
        if np.any(np.isnan(grad_w)) or np.any(np.isinf(grad_w)):
            print(f"⚠️ Warning: NaN/Inf detected in grad_w, skipping update")
            return
        if np.isnan(grad_b) or np.isinf(grad_b):
            print(f"⚠️ Warning: NaN/Inf detected in grad_b, skipping update")
            return

        if self.adam:
            self.t += 1
            self.m_W = self.beta1 * self.m_W + (1 - self.beta1) * grad_w
            self.m_b = self.beta1 * self.m_b + (1 - self.beta1) * grad_b
            self.v_W = self.beta2 * self.v_W + (1 - self.beta2) * (grad_w ** 2)
            self.v_b = self.beta2 * self.v_b + (1 - self.beta2) * (grad_b ** 2)

            m_W_hat = self.m_W / (1 - self.beta1 ** self.t)
            m_b_hat = self.m_b / (1 - self.beta1 ** self.t)
            v_W_hat = self.v_W / (1 - self.beta2 ** self.t)
            v_b_hat = self.v_b / (1 - self.beta2 ** self.t)

            # Take gradient step
            W_temp = self.W - self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            b_temp = self.b - self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
        else:
            # Standard gradient descent
            W_temp = self.W - self.learning_rate * grad_w
            b_temp = self.b - self.learning_rate * grad_b
        
        # Check for NaN/Inf in temporary weights
        if np.any(np.isnan(W_temp)) or np.any(np.isinf(W_temp)):
            print(f"⚠️ Warning: NaN/Inf detected in W_temp, skipping update")
            return
        if np.isnan(b_temp) or np.isinf(b_temp):
            print(f"⚠️ Warning: NaN/Inf detected in b_temp, skipping update")
            return
        
        # Project onto constraint set
        self.W = self.project_onto_constraints(W_temp)
        self.b = b_temp
        
        # Final check for NaN/Inf after projection
        if np.any(np.isnan(self.W)) or np.any(np.isinf(self.W)):
            print(f"❌ Error: NaN/Inf detected in W after projection!")
            self.W = np.zeros(self.n)  # Reset to zeros
        if np.isnan(self.b) or np.isinf(self.b):
            print(f"❌ Error: NaN/Inf detected in b after projection!")
            self.b = 0  # Reset to zero

    def project_onto_constraints(self, W):
        """Project weights onto combination constraints using improved mapping"""
        projected_W = W.copy()
        
        # Apply negative constraints: base + interaction ≤ 0
        for base_idx, interaction_indices in self.negative_constraint_map.items():
            for inter_idx in interaction_indices:
                if 0 <= base_idx < len(W) and 0 <= inter_idx < len(W):
                    total_beta = W[base_idx] + W[inter_idx]
                    if total_beta > 0:  # Violation
                        deficit = -total_beta
                        # Half adjustment: base and interaction equally
                        projected_W[base_idx] += deficit / 2
                        projected_W[inter_idx] += deficit / 2
        
        # Apply positive constraints: base + interaction ≥ 0
        for base_idx, interaction_indices in self.positive_constraint_map.items():
            for inter_idx in interaction_indices:
                if 0 <= base_idx < len(W) and 0 <= inter_idx < len(W):
                    total_beta = W[base_idx] + W[inter_idx]
                    if total_beta < 0:  # Violation
                        deficit = -total_beta
                        # Half adjustment: base and interaction equally
                        projected_W[base_idx] += deficit / 2
                        projected_W[inter_idx] += deficit / 2
        
        return projected_W

    def predict(self, X):
        return X.dot(self.W) + self.b

    def __sklearn_clone__(self):
        """Custom clone method for sklearn compatibility"""
        return StackConstrainedLinearRegression(
            learning_rate=self.learning_rate,
            iterations=self.iterations,
            adam=self.adam,
            beta1=self.beta1,
            beta2=self.beta2,
            epsilon=self.epsilon,
            negative_constraints=self.negative_constraints.copy() if self.negative_constraints else [],
            positive_constraints=self.positive_constraints.copy() if self.positive_constraints else []
        )


# Models Dictionary
def get_models():
    return {
        "Linear Regression": LinearRegression(),
        "Ridge Regression": Ridge(alpha=1.0),
        "Lasso Regression": Lasso(alpha=0.1),
        "ElasticNet Regression": ElasticNet(alpha=0.1, l1_ratio=0.5),
        "Bayesian Ridge Regression": BayesianRidge(),
        "Custom Constrained Ridge": CustomConstrainedRidge(l2_penalty=0.1, learning_rate=0.001, iterations=10000),
        "Constrained Linear Regression": ConstrainedLinearRegression(learning_rate=0.001, iterations=10000),
        "Constrained Ridge": StackConstrainedRidge(l2_penalty=0.1, learning_rate=0.001, iterations=10000),
        "Constrained Linear Regression": StackConstrainedLinearRegression(learning_rate=0.001, iterations=10000)
    }

# Helper function
def safe_mape(y_true, y_pred):
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)
    nonzero_mask = (y_true != 0)
    y_true_nonzero = y_true[nonzero_mask]
    y_pred_nonzero = y_pred[nonzero_mask]
    if len(y_true_nonzero) == 0:
        return float("nan")
    return np.mean(np.abs((y_true_nonzero - y_pred_nonzero) / y_true_nonzero)) * 100