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
            print(f"🔍 Constraints applied - Negative: {len(self.negative_indices)}, Positive: {len(self.positive_indices)}")

        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        for _ in range(self.iterations):
            self.update_weights()

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

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

            self.W -= self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            self.b -= self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
        else:
            self.W -= self.learning_rate * grad_w
            self.b -= self.learning_rate * grad_b

        # Apply constraints
        for i in range(self.n):
            # Negative constraints: force coefficient ≤ 0
            if i in self.negative_indices and self.W[i] > 0:
                self.W[i] = 0
            # Positive constraints: force coefficient ≥ 0  
            if i in self.positive_indices and self.W[i] < 0:
                self.W[i] = 0

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

        if self.adam:
            self.m_W = np.zeros(self.n)
            self.v_W = np.zeros(self.n)
            self.m_b = 0
            self.v_b = 0
            self.t = 0

        for _ in range(self.iterations):
            self.update_weights()

        self.intercept_ = self.b
        self.coef_ = self.W
        return self

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

            self.W -= self.learning_rate * m_W_hat / (np.sqrt(v_W_hat) + self.epsilon)
            self.b -= self.learning_rate * m_b_hat / (np.sqrt(v_b_hat) + self.epsilon)
        else:
            self.W -= self.learning_rate * dW
            self.b -= self.learning_rate * db

        # Apply constraints
        for i in range(self.n):
            # Negative constraints: force coefficient ≤ 0
            if i in self.negative_indices and self.W[i] > 0:
                self.W[i] = 0
            # Positive constraints: force coefficient ≥ 0  
            if i in self.positive_indices and self.W[i] < 0:
                self.W[i] = 0

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


# Models Dictionary
def get_models():
    return {
        "Linear Regression": LinearRegression(),
        "Ridge Regression": Ridge(alpha=1.0),
        "Lasso Regression": Lasso(alpha=0.1),
        "ElasticNet Regression": ElasticNet(alpha=0.1, l1_ratio=0.5),
        "Bayesian Ridge Regression": BayesianRidge(),
        "Custom Constrained Ridge": CustomConstrainedRidge(l2_penalty=0.1, learning_rate=0.001, iterations=10000),
        "Constrained Linear Regression": ConstrainedLinearRegression(learning_rate=0.001, iterations=10000)
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